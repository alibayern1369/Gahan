"use client";

/**
 * Client-side selfie pipeline.
 *  - wait for a real video frame (fixes blank/beige 1×1 captures on mobile Safari)
 *  - resize to max dimension
 *  - JPEG re-encode (canvas re-encode strips ALL EXIF metadata incl. GPS)
 *  - iterative quality reduction toward the target size (~100–250 KB)
 */

const MIN_SELFIE_BYTES = 8_000;
const MIN_SELFIE_DIM = 64;

export async function captureAndCompress(
  source: HTMLVideoElement | Blob,
  maxDim = 1024,
  targetBytes = 230 * 1024,
  flipHorizontal = false
): Promise<Blob> {
  if (source instanceof Blob) {
    const bitmap = await createImageBitmap(source);
    try {
      return await rasterizeBitmap(bitmap, maxDim, targetBytes, false);
    } finally {
      bitmap.close();
    }
  }

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      if (attempt > 0) {
        await delay(250 * attempt);
      }
      const blob = await captureVideoFrame(source, maxDim, targetBytes, flipHorizontal);
      assertAcceptableSelfie(blob);
      return blob;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error("capture_failed");
    }
  }
  throw lastErr ?? new Error("capture_failed");
}

async function captureVideoFrame(
  video: HTMLVideoElement,
  maxDim: number,
  targetBytes: number,
  flipHorizontal: boolean
): Promise<Blob> {
  await waitForVideoFrame(video);

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (vw < MIN_SELFIE_DIM || vh < MIN_SELFIE_DIM) {
    throw new Error("video_not_ready");
  }

  const scale = Math.min(1, maxDim / Math.max(vw, vh));
  const w = Math.max(MIN_SELFIE_DIM, Math.round(vw * scale));
  const h = Math.max(MIN_SELFIE_DIM, Math.round(vh * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");

  if (flipHorizontal) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  // Explicit source rect — more reliable than scaling implicitly on iOS Safari.
  ctx.drawImage(video, 0, 0, vw, vh, 0, 0, w, h);

  return encodeCanvas(canvas, targetBytes);
}

async function rasterizeBitmap(
  bitmap: ImageBitmap,
  maxDim: number,
  targetBytes: number,
  flipHorizontal: boolean
): Promise<Blob> {
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");
  if (flipHorizontal) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(bitmap, 0, 0, w, h);

  return encodeCanvas(canvas, targetBytes);
}

async function waitForVideoFrame(video: HTMLVideoElement, timeoutMs = 8000): Promise<void> {
  const isReady = () =>
    video.videoWidth >= MIN_SELFIE_DIM &&
    video.videoHeight >= MIN_SELFIE_DIM &&
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;

  if (isReady()) {
    await waitForPaint(video);
    if (isReady()) return;
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("video_not_ready"));
    }, timeoutMs);

    const check = () => {
      if (isReady()) {
        cleanup();
        void waitForPaint(video).then(resolve).catch(reject);
      }
    };

    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener("loadeddata", check);
      video.removeEventListener("playing", check);
      video.removeEventListener("canplay", check);
    };

    video.addEventListener("loadeddata", check);
    video.addEventListener("playing", check);
    video.addEventListener("canplay", check);
    check();
  });
}

async function waitForPaint(video: HTMLVideoElement): Promise<void> {
  const rvfc = (
    video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }
  ).requestVideoFrameCallback;
  if (typeof rvfc === "function") {
    await new Promise<void>((resolve) => {
      rvfc.call(video, () => resolve());
    });
    return;
  }
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

async function encodeCanvas(canvas: HTMLCanvasElement, targetBytes: number): Promise<Blob> {
  let quality = 0.85;
  let blob = await canvasToBlob(canvas, quality);
  while (blob.size > targetBytes && quality > 0.45) {
    quality -= 0.12;
    blob = await canvasToBlob(canvas, quality);
  }
  return blob;
}

function assertAcceptableSelfie(blob: Blob): void {
  if (blob.size < MIN_SELFIE_BYTES) {
    throw new Error("selfie_too_small");
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("encode_failed"))),
      "image/jpeg",
      quality
    );
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export interface GeoFix {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export interface GeoResult {
  fix: GeoFix;
  bestAccuracyAchieved: boolean;
}

/**
 * High-accuracy position with bounded retries; keeps the best (lowest) accuracy
 * across attempts instead of failing on the first noisy fix.
 */
export async function getAccuratePosition(
  maxAccuracyMeters: number,
  maxAttempts = 3
): Promise<GeoFix> {
  let best: GeoFix | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const fix = await singlePosition(attempt === 0 ? 14_000 : 10_000);
    if (!best || fix.accuracy < best.accuracy) best = fix;
    if (best.accuracy <= maxAccuracyMeters) return best;
  }

  if (!best) throw new Error("position_unavailable");
  return best;
}

function singlePosition(timeoutMs: number): Promise<GeoFix> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? 9999,
        }),
      (err) => reject(new Error(err.code === 1 ? "permission_denied" : err.code === 3 ? "timeout" : "unavailable")),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    );
  });
}
