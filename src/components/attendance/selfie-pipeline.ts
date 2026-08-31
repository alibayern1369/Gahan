"use client";

/**
 * Client-side selfie pipeline.
 *  - resize to max dimension
 *  - JPEG re-encode (canvas re-encode strips ALL EXIF metadata incl. GPS)
 *  - iterative quality reduction toward the target size (~100–250 KB)
 */
export async function captureAndCompress(
  source: HTMLVideoElement | Blob,
  maxDim = 1024,
  targetBytes = 230 * 1024,
  flipHorizontal = false
): Promise<Blob> {
  const bitmap = await loadBitmap(source);
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
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);
  if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();

  let quality = 0.85;
  let blob = await canvasToBlob(canvas, quality);
  while (blob.size > targetBytes && quality > 0.45) {
    quality -= 0.12;
    blob = await canvasToBlob(canvas, quality);
  }
  return blob;
}

async function loadBitmap(source: HTMLVideoElement | Blob): Promise<ImageBitmap | HTMLVideoElement> {
  if (source instanceof Blob) {
    return createImageBitmap(source);
  }
  // wait until dimensions are known
  if (!source.videoWidth) {
    await new Promise<void>((resolve) => {
      source.onloadedmetadata = () => resolve();
    });
  }
  return source;
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
