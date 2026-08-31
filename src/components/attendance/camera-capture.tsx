"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CameraOff, RefreshCw, SwitchCamera } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface CameraCaptureProps {
  onCapture: (blob: Blob) => void;
  onCancel: () => void;
}

type CameraState = "starting" | "live" | "denied" | "unavailable" | "insecure" | "unsupported";

/** Front cameras on mobile often deliver a mirrored feed; flip preview + capture to show true orientation. */
function isMobileFrontCamera(): boolean {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

/**
 * Front-facing camera capture with graceful degradation:
 * getUserMedia → file input with capture attribute (works on iOS/Android even
 * when getUserMedia is blocked) — both paths go through the same compressor.
 */
export function CameraCapture({ onCapture, onCancel }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<CameraState>("starting");
  const [busy, setBusy] = useState(false);
  const [frameReady, setFrameReady] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (!window.isSecureContext) {
        setState("insecure");
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setState("unsupported");
        return;
      }

      const constraints = [
        { video: { facingMode: { ideal: "user" }, width: { ideal: 1080 }, height: { ideal: 1440 } }, audio: false },
        { video: true, audio: false },
      ];

      for (const c of constraints) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia(c);
          if (cancelled) {
            stopStream(stream);
            return;
          }
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play().catch(() => undefined);
          }
          setState("live");
          return;
        } catch (err) {
          const name = (err as DOMException).name;
          if (name === "NotAllowedError") {
            setState("denied");
            return;
          }
          // try next constraint set
        }
      }
      setState("unavailable");
    }

    void start();
    return () => {
      cancelled = true;
      stopStream(streamRef.current);
    };
  }, []);

  useEffect(() => {
    if (state !== "live") {
      setFrameReady(false);
      return;
    }
    const video = videoRef.current;
    if (!video) return;

    const check = () => {
      setFrameReady(
        video.videoWidth >= 64 &&
          video.videoHeight >= 64 &&
          video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      );
    };

    video.addEventListener("loadeddata", check);
    video.addEventListener("playing", check);
    video.addEventListener("canplay", check);
    check();

    return () => {
      video.removeEventListener("loadeddata", check);
      video.removeEventListener("playing", check);
      video.removeEventListener("canplay", check);
    };
  }, [state]);

  const shoot = useCallback(async () => {
    const video = videoRef.current;
    if (!video || state !== "live") return;
    setBusy(true);
    setCaptureError(null);
    try {
      const { captureAndCompress } = await import("./selfie-pipeline");
      const flip = isMobileFrontCamera();
      const blob = await captureAndCompress(video, 1024, 230 * 1024, flip);
      onCapture(blob);
    } catch {
      setCaptureError("دوربین هنوز آماده نیست. چند ثانیه صبر کنید و دوباره «عکس بگیر» را بزنید.");
    } finally {
      setBusy(false);
    }
  }, [state, onCapture]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const { captureAndCompress } = await import("./selfie-pipeline");
      const blob = await captureAndCompress(file);
      onCapture(blob);
    } catch {
      setBusy(false);
    }
  }

  function stopStream(stream: MediaStream | null) {
    stream?.getTracks().forEach((t) => t.stop());
  }

  return (
    <div className="space-y-4">
      <div className="relative aspect-3/4 w-full overflow-hidden rounded-3xl bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`size-full object-cover ${state === "live" && isMobileFrontCamera() ? "-scale-x-100" : ""} ${state === "live" ? "" : "hidden"}`}
          aria-label="دوربین سلفی"
        />

        {state !== "live" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-white/10 text-white/80">
              <CameraOff className="size-6" aria-hidden />
            </div>
            <p className="text-xs font-medium leading-6 text-white/85">{cameraMessage(state)}</p>
            {(state === "denied" || state === "insecure" || state === "unsupported" || state === "unavailable") ? (
              <>
                <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} loading={busy}>
                  گرفتن عکس با دوربین گوشی
                </Button>
                <p className="text-[10px] text-white/60">
                  اگر دسترسی دوربین مسدود شده، با این دکمه از اپلیکیشن دوربین خود گوشی استفاده می‌شود.
                </p>
              </>
            ) : null}
            <p className="skeleton absolute inset-x-8 bottom-8 h-1.5 rounded-full opacity-40" aria-hidden />
          </div>
        ) : null}

        {/* framing guide */}
        {state === "live" ? (
          <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="size-52 rounded-full border-2 border-dashed border-white/50 sm:size-60" />
          </div>
        ) : null}
      </div>

      <input ref={fileRef} type="file" accept="image/*" capture="user" onChange={onFile} hidden />

      {captureError ? (
        <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-center text-[11px] leading-6 text-amber-700 dark:text-amber-300">
          {captureError}
        </p>
      ) : null}

      {state === "live" ? (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <span />
          <Button size="lg" onClick={shoot} loading={busy} disabled={!frameReady} className="rounded-full px-10">
            {!busy && <SwitchCamera className="size-5" aria-hidden />}
            {frameReady ? "عکس بگیر" : "آماده‌سازی دوربین…"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy} type="button">
            انصراف
          </Button>
        </div>
      ) : (
        <Button variant="ghost" onClick={onCancel} className="w-full">
          بازگشت
        </Button>
      )}

      <button onClick={() => window.location.reload()} className="mx-auto flex items-center gap-1 text-[10px] text-faint hover:text-secondary" type="button">
        <RefreshCw className="size-3" aria-hidden /> تلاش برای راه‌اندازی مجدد دوربین
      </button>
    </div>
  );
}

function cameraMessage(state: CameraState): string {
  switch (state) {
    case "starting":
      return "در حال روشن کردن دوربین…";
    case "denied":
      return "دسترسی به دوربین رد شد. لطفاً از تنظیمات مرورگر اجازهٔ دوربین را فعال کنید و صفحه را دوباره باز کنید.";
    case "insecure":
      return "استفاده از دوربین فقط در حالت امن (HTTPS) امکان‌پذیر است.";
    case "unsupported":
      return "مرورگر شما از دوربین وب پشتیبانی نمی‌کند. می‌توانید با دوربین خودِ گوشی عکس بگیرید.";
    default:
      return "دوربین در دسترس نیست. لطفاً بررسی کنید برنامهٔ دیگری دوربین را اشغال نکرده باشد.";
  }
}
