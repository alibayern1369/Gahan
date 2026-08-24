"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Clock3,
  Loader2,
  LogIn,
  LogOut,
  MapPin,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { CameraCapture } from "./camera-capture";
import { captureAndCompress, getAccuratePosition, type GeoFix } from "./selfie-pipeline";
import { attendanceErrorMessage } from "@/lib/errors";
import { getClient } from "@/lib/supabase/client";
import {
  precheckLocationAction,
  submitAttendanceAction,
  type SubmitResult,
} from "@/lib/actions/attendance";

type Phase =
  | { kind: "idle" }
  | { kind: "locating"; attemptHint?: boolean }
  | { kind: "checking" }
  | { kind: "camera" }
  | { kind: "preview"; blobUrl: string }
  | { kind: "uploading" }
  | { kind: "success"; at: string; lateMinutes?: number; workedMinutes?: number; type: string }
  | { kind: "error"; message: string; retryable: boolean };

export interface AttendanceFlowProps {
  nextAction: "check_in" | "check_out";
  maxAccuracy: number;
  timezone: string;
  userId: string;
  workplace: { name: string | null; latitude: number | null; longitude: number | null; radius: number | null };
}

export function AttendanceFlow({ nextAction, maxAccuracy, timezone, userId, workplace }: AttendanceFlowProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [fix, setFix] = useState<GeoFix | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const busyRef = useRef(false);
  const router = useRouter();
  const { toast } = useToast();

  const isCheckIn = nextAction === "check_in";

  /* ------------------------------------------------ start: geolocation */
  const begin = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setPhase({ kind: "locating" });

    try {
      const geoFix = await getAccuratePosition(maxAccuracy);
      setFix(geoFix);
      setPhase({ kind: "checking" });

      const result = await precheckLocationAction(geoFix);
      if (!result.ok) {
        if (result.code === "poor_accuracy") {
          toast("error", attendanceErrorMessage(result.code));
          setPhase({ kind: "idle" });
        } else {
          setPhase({
            kind: "error",
            message: attendanceErrorMessage(result.code),
            retryable: false,
          });
        }
        return;
      }

      // location valid → open camera
      setPhase({ kind: "camera" });
    } catch (err) {
      const code = (err as Error).message;
      if (code === "permission_denied") {
        toast(
          "error",
          "لطفاً دسترسی به موقعیت مکانی را فعال کنید. از تنظیمات مرورگر یا گوشی، اجازهٔ موقعیت مکانی را برای این سایت روی «مجاز» بگذارید."
        );
      } else if (code === "timeout") {
        toast("error", "دریافت موقعیت مکانی طول کشید. لطفاً نزدیک پنجره یا فضای باز دوباره تلاش کنید.");
      } else {
        toast("error", "موقعیت مکانی در دسترس نیست. GPS گوشی را روشن کنید و دوباره امتحان کنید.");
      }
      setPhase({ kind: "idle" });
    } finally {
      busyRef.current = false;
    }
  }, [maxAccuracy, toast]);

  /* -------------------------------------------- after photo taken */
  const onCaptured = useCallback((captured: Blob) => {
    setBlob(captured);
    setPhase({ kind: "preview", blobUrl: URL.createObjectURL(captured) });
  }, []);

  const retake = useCallback(() => {
    setPhase({ kind: "camera" });
  }, []);

  /* --------------------------------- final upload + authoritative submit */
  const confirmSubmit = useCallback(async () => {
    if (!fix || !blob) return;
    setPhase({ kind: "uploading" });

    try {
      const supabase = getClient();
      const path = `${userId}/${Date.now()}-${isCheckIn ? "in" : "out"}.jpg`;

      const { data: regId, error: regError } = await supabase.rpc("register_photo_upload", { p_path: path });
      if (regError || !regId) throw new Error("register_failed");

      const compressed = await captureAndCompress(blob); // idempotent re-encode guard
      const { error: upError } = await supabase.storage.from("selfies").upload(path, compressed, {
        contentType: "image/jpeg",
        cacheControl: "3600",
        upsert: false,
      });
      if (upError) {
        await supabase.rpc("register_photo_upload", { p_path: `${userId}/cleanup-${Date.now()}.jpg` }).catch(() => undefined);
        throw new Error("upload_failed");
      }

      const result: SubmitResult = await submitAttendanceAction({
        type: isCheckIn ? "check_in" : "check_out",
        latitude: fix.latitude,
        longitude: fix.longitude,
        accuracy: fix.accuracy,
        photoPath: path,
      });

      if (!result.ok) {
        // remove now-orphaned photo
        await supabase.storage.from("selfies").remove([path]).catch(() => undefined);
        setPhase({ kind: "error", message: attendanceErrorMessage(result.code), retryable: result.code === "server_error" });
        return;
      }

      setPhase({
        kind: "success",
        at: String(result.at),
        lateMinutes: "lateMinutes" in result ? result.lateMinutes : undefined,
        workedMinutes: "workedMinutes" in result ? result.workedMinutes : undefined,
        type: result.type,
      });
      router.refresh();
    } catch (err) {
      console.error("[attendance-flow]", err);
      setPhase({
        kind: "error",
        message:
          (err as Error).message === "upload_failed"
            ? "بارگذاری عکس ناموفق بود. اتصال اینترنت را بررسی و دوباره تلاش کنید."
            : "ثبت حضور ناموفق بود. لطفاً دوباره تلاش کنید.",
        retryable: true,
      });
    }
  }, [blob, fix, isCheckIn, router, userId]);

  /* ------------------------------------------------------------- render */

  if (phase.kind === "success") {
    return (
      <GlassCard strong className="pop-in p-8 text-center">
        <svg viewBox="0 0 64 64" className="mx-auto size-16 text-mint-500" aria-hidden>
          <circle cx="32" cy="32" r="30" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.25" />
          <path className="draw-check" d="M18 33 L28 43 L46 24" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h2 className="mt-4 text-lg font-extrabold">
          {phase.type === "check_in" ? "ورود شما با موفقیت ثبت شد." : "خروج شما با موفقیت ثبت شد."}
        </h2>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <Badge tone="info" icon={Clock3}>
            {new Date(phase.at).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit", timeZone: timezone })}
          </Badge>
          {phase.lateMinutes && phase.lateMinutes > 0 ? (
            <Badge tone="warning">تأخیر: {phase.lateMinutes.toLocaleString("fa-IR")} دقیقه</Badge>
          ) : null}
          {phase.workedMinutes != null ? (
            <Badge tone="success">
              کارکرد: {Math.floor(phase.workedMinutes / 60).toLocaleString("fa-IR")} ساعت و{" "}
              {(phase.workedMinutes % 60).toLocaleString("fa-IR")} دقیقه
            </Badge>
          ) : null}
          <Badge tone="brand" icon={ShieldCheck}>
            تأیید شده توسط سرور گاهان
          </Badge>
        </div>
        <Button variant="secondary" className="mt-6 w-full" onClick={() => setPhase({ kind: "idle" })}>
          بازگشت
        </Button>
      </GlassCard>
    );
  }

  if (phase.kind === "error") {
    return (
      <GlassCard strong className="pop-in p-8 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-rose-500/12 text-rose-500">
          <TriangleAlert className="size-7" aria-hidden />
        </div>
        <h2 className="mt-4 text-base font-bold">ثبت انجام نشد</h2>
        <p className="mt-2 text-xs leading-6 text-secondary">{phase.message}</p>
        <div className="mt-6 grid grid-cols-2 gap-2">
          {phase.retryable ? (
            <Button variant="secondary" onClick={() => setPhase({ kind: "camera" })}>
              تلاش مجدد
            </Button>
          ) : null}
          <Button variant={phase.retryable ? "ghost" : "primary"} onClick={() => setPhase({ kind: "idle" })} className={phase.retryable ? "" : "col-span-2"}>
            بازگشت
          </Button>
        </div>
      </GlassCard>
    );
  }

  if (phase.kind === "camera") {
    return (
      <GlassCard strong className="p-4">
        <CameraCapture onCapture={onCaptured} onCancel={() => setPhase({ kind: "idle" })} />
      </GlassCard>
    );
  }

  if (phase.kind === "preview" && blob) {
    return (
      <GlassCard strong className="space-y-4 p-4">
        <div className="relative aspect-3/4 overflow-hidden rounded-2xl bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={phase.blobUrl} alt="پیش‌نمایش سلفی" className="size-full object-cover" />
        </div>
        <p className="text-center text-[11px] text-secondary">
          عکس شما فقط برای تأیید حضور ذخیره می‌شود و پس از حدود یک ماه به‌صورت خودکار حذف خواهد شد.
        </p>
        <div className="grid grid-cols-2 gap-2 pb-1">
          <Button variant="secondary" onClick={retake} disabled>
            <RotateCcw className="size-4" aria-hidden /> عکس مجدد
          </Button>
          <Button variant={isCheckIn ? "success" : "danger"} loading={false} onClick={confirmSubmit}>
            ثبت
          </Button>
        </div>
      </GlassCard>
    );
  }

  if (phase.kind === "locating" || phase.kind === "checking") {
    return (
      <GlassCard strong className="space-y-5 p-8 text-center">
        <Loader2 className="mx-auto size-10 animate-spin text-brand-500" aria-hidden />
        <div>
          <h2 className="text-sm font-bold">{phase.kind === "locating" ? "در حال یافتن موقعیت مکانی…" : "بررسی محدودهٔ مجاز…"}</h2>
          <p className="mx-auto mt-2 max-w-xs text-[11px] leading-6 text-secondary">
            {phase.kind === "locating"
              ? "GPS با بالاترین دقت فعال می‌شود. اگر داخل ساختمان هستید، نزدیک پنجره بایستید تا سریع‌تر قفل شود."
              : `فاصلهٔ شما با محل کاری «${workplace.name ?? "تعیین‌نشده"}» بررسی می‌شود.`}
          </p>
        </div>
        <div className="flex justify-center gap-1.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} className="size-2 animate-pulse rounded-full bg-brand-400" style={{ animationDelay: `${i * 180}ms` }} />
          ))}
        </div>
      </GlassCard>
    );
  }

  if (phase.kind === "uploading") {
    return (
      <GlassCard strong className="space-y-5 p-8 text-center">
        <Loader2 className="mx-auto size-10 animate-spin text-mint-500" aria-hidden />
        <h2 className="text-sm font-bold">در حال ثبت نهایی حضور…</h2>
        <p className="text-[11px] text-secondary">عکس آپلود و رکورد توسط سرور تأیید می‌شود؛ صفحه را نبندید.</p>
      </GlassCard>
    );
  }

  /* ------------------------------- idle — the big action button */
  const distanceLabel = fix ? Math.round(fix.accuracy) : null;

  return (
    <GlassCard strong className="space-y-4 p-6 text-center">
      <button
        type="button"
        onClick={begin}
        aria-label={isCheckIn ? "ثبت ورود" : "ثبت خروج"}
        className={`group relative mx-auto flex size-44 w-full max-w-56 cursor-pointer flex-col items-center justify-center gap-2 rounded-[2rem] font-black text-white shadow-xl transition-transform duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--ring-color)] active:scale-[0.98] ${
          isCheckIn
            ? "bg-gradient-to-bl from-mint-600 to-mint-400 shadow-mint-600/30 pulse-ring"
            : "bg-gradient-to-bl from-rose-600 to-orange-500 shadow-rose-600/30"
        }`}
      >
        {isCheckIn ? <LogIn className="size-8" aria-hidden /> : <LogOut className="size-8" aria-hidden />}
        <span className="text-xl tracking-tight">{isCheckIn ? "ثبت ورود" : "ثبت خروج"}</span>
        <span className="text-[10px] font-semibold opacity-85">
          {isCheckIn ? "با تأیید موقعیت + سلفی" : "پایان کار امروز"}
        </span>
      </button>

      <div className="flex items-center justify-center gap-1.5 text-[11px] text-faint">
        <MapPin className="size-3.5" aria-hidden />
        {workplace.name
          ? `${workplace.name} — شعاع مجاز ${workplace.radius?.toLocaleString("fa-IR")} متر`
          : "محل کاری تعیین نشده"}
        {distanceLabel ? <span className="tabular-nums">(دقت آخرین موقعیت: {distanceLabel.toLocaleString("fa-IR")} م)</span> : null}
      </div>

      <p className="text-[10px] leading-5 text-faint">
        زمان ثبت توسط سرور گاهان تعیین می‌شود؛ ساعت گوشی ملاک نیست.
        <br />
        <CheckCircle2 className="mb-0.5 inline size-3 text-mint-500" aria-hidden /> تصویر شما در فضای خصوصی ذخیره می‌شود.
      </p>
    </GlassCard>
  );
}
