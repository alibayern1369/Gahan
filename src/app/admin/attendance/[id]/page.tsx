import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Fingerprint, MapPin, ShieldCheck, Smartphone, TriangleAlert } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { AttendanceAdjustForm } from "@/components/admin/attendance-adjust-form";
import { Badge } from "@/components/ui/badge";
import { GlassCard, SectionTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSelfieUrl } from "@/lib/reports";
import { dateToJalali } from "@/lib/jalali";
import { faNum, formatClockDuration, formatJalaliDateTime } from "@/lib/format";
import { getSettings } from "@/lib/settings-server";

export const dynamic = "force-dynamic";

export default async function AttendanceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const sessionId = Number(id);
  if (!Number.isInteger(sessionId)) notFound();

  const settings = await getSettings();
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("attendance_sessions")
    .select("*, profiles!inner(first_name, last_name, employee_code, email)")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) notFound();

  const [checkinUrl, checkoutUrl, adjustments, suspicious] = await Promise.all([
    session.checkin_photo_path && !session.checkin_photo_deleted_at
      ? getSelfieUrl(session.checkin_photo_path, 600)
      : null,
    session.checkout_photo_path && !session.checkout_photo_deleted_at
      ? getSelfieUrl(session.checkout_photo_path, 600)
      : null,
    supabase
      .from("admin_adjustments")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false }),
    supabase.from("suspicious_events").select("*").eq("session_id", sessionId),
  ]);

  const profile = session.profiles as { first_name: string; last_name: string; employee_code: string | null; email: string | null };
  const checkinJ = dateToJalali(new Date(session.checkin_at), settings.timezone);

  return (
    <>
      <Link href="/admin/today" className="mb-4 inline-flex items-center gap-1 text-xs font-bold text-secondary hover:text-brand-500">
        <ArrowRight className="size-4" aria-hidden /> بازگشت به حضور امروز
      </Link>

      <AdminPageHeader title={`رکورد #${faNum(sessionId)}`} subtitle={`${profile.first_name} ${profile.last_name}${profile.employee_code ? ` — ${profile.employee_code}` : ""}`} />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* left column */}
        <div className="space-y-4 lg:col-span-2">
          <GlassCard className="p-5">
            <SectionTitle title="زمان‌ها" subtitle="مختصات زمانی سرور (UTC ذخیره شده، نمایش شمسی)" />
            <dl className="grid gap-3 sm:grid-cols-2">
              <Info label="ورود" value={formatJalaliDateTime(session.checkin_at, settings.timezone)} />
              <Info label="خروج" value={session.checkout_at ? formatJalaliDateTime(session.checkout_at, settings.timezone) : "ثبت نشده"} />
              <Info label="کارکرد" value={formatClockDuration(session.worked_minutes)} />
              <Info label="تأخیر / تعجیل" value={`${faNum(session.late_minutes)} دقیقه تأخیر — ${faNum(session.early_leave_minutes)} دقیقه تعجیل`} />
              <Info label="اضافه‌کار" value={session.overtime_minutes > 0 ? `${faNum(session.overtime_minutes)} دقیقه` : "—"} />
              <Info label="محل کار" value={session.workplaces?.name ?? "—"} />
            </dl>
          </GlassCard>

          <GlassCard className="p-5">
            <SectionTitle title="اعتبارسنجی موقعیت" subtitle="محاسبه فاصله در سرور انجام شده است" icon={<ShieldCheck className="size-4 text-mint-500" />} />
            <dl className="grid gap-3 sm:grid-cols-2">
              {session.checkin_latitude != null ? (
                <>
                  <Info label="ورود — فاصله محاسبه‌شده" value={`${faNum(Math.round(session.checkin_distance_m))} متر از مرکز`} />
                  <Info label="ورود — شعاع مجاز" value={`${faNum(session.checkin_allowed_radius_m)} متر`} />
                  <Info label="ورود — دقت GPS" value={`${faNum(Math.round(session.checkin_accuracy_m))} متر`} />
                  <Info label="مختصات ورود" value={`${session.checkin_latitude.toFixed(6)}, ${session.checkin_longitude.toFixed(6)}`} />
                </>
              ) : null}
              {session.checkout_latitude != null ? (
                <>
                  <Info label="خروج — فاصله" value={`${faNum(Math.round(session.checkout_distance_m))} متر`} />
                  <Info label="خروج — دقت GPS" value={`${faNum(Math.round(session.checkout_accuracy_m))} متر`} />
                </>
              ) : null}
            </dl>

            {session.checkin_latitude != null ? (
              <div className="mt-4 overflow-hidden rounded-2xl ring-1 ring-black/10 dark:ring-white/10">
                <iframe
                  title="نقشه موقعیت"
                  loading="lazy"
                  className="h-56 w-full border-0"
                  src={osmEmbedUrl(session.checkin_latitude, session.checkin_longitude)}
                />
              </div>
            ) : null}
          </GlassCard>

          <GlassCard className="p-5">
            <SectionTitle title="سلفی‌های رکورد" subtitle="دسترسی خصوصی با لینک امضاشده موقت" icon={<Fingerprint className="size-4 text-brand-500" />} />
            <div className="flex flex-wrap gap-4">
              <SelfieBox url={checkinUrl} label="سلفی ورود" deleted={!!session.checkin_photo_deleted_at} hasPath={!!session.checkin_photo_path} />
              <SelfieBox url={checkoutUrl} label="سلفی خروج" deleted={!!session.checkout_photo_deleted_at} hasPath={!!session.checkout_photo_path} />
            </div>
            <p className="mt-3 text-[11px] text-faint">
              عکس‌ها پس از حدود {faNum(settings.selfie_retention_days)} روز به‌صورت خودکار حذف می‌شوند؛ داده‌های رکورد باقی می‌مانند.
            </p>
          </GlassCard>

          {(suspicious.data?.length ?? 0) > 0 || session.has_manual_adjustment ? (
            <GlassCard className="p-5">
              <SectionTitle title="هشدارها و اصلاحات" icon={<TriangleAlert className="size-4 text-amber-500" />} />
              <ul className="space-y-2 text-xs">
                {(suspicious.data ?? []).map((ev) => (
                  <li key={ev.id} className="rounded-xl bg-amber-500/8 px-3 py-2 text-amber-700 dark:text-amber-300">
                    رویداد مشکوک: {eventTypeFa(ev.type)} — {formatJalaliDateTime(ev.created_at, settings.timezone)}
                  </li>
                ))}
                {(adjustments.data ?? []).map((adj) => (
                  <li key={adj.id} className="rounded-xl bg-sky-500/8 px-3 py-2 leading-6 text-secondary">
                    اصلاح مدیریتی ({adjustmentActionFa(adj.action)}) — {formatJalaliDateTime(adj.created_at, settings.timezone)}
                    {adj.reason ? ` — دلیل: ${adj.reason}` : ""}
                  </li>
                ))}
              </ul>
            </GlassCard>
          ) : null}
        </div>

        {/* right column */}
        <div className="space-y-4">
          <GlassCard className="p-5">
            <SectionTitle title="اصلاح رکورد" subtitle="همهٔ تغییرات در لاگ ممیزی ثبت می‌شود." />
            <AttendanceAdjustForm
              sessionId={sessionId}
              profileId={session.profile_id}
              timezone={settings.timezone}
              defaultJalali={{ jy: checkinJ.jy, jm: checkinJ.jm, jd: checkinJ.jd }}
            />
          </GlassCard>

          <GlassCard className="p-5">
            <SectionTitle title="اطلاعات دستگاه" icon={<Smartphone className="size-4" />} />
            <dl className="space-y-3 text-xs">
              <Info label="User Agent ورود" value={session.checkin_user_agent ?? "—"} small />
              <Info label="IP ورود" value={session.checkin_ip ?? "—"} />
              {session.checkout_ip ? <Info label="IP خروج" value={session.checkout_ip} /> : null}
            </dl>
            <div className="mt-3 flex items-center gap-1.5 text-[10px] text-faint">
              <MapPin className="size-3" aria-hidden /> این اطلاعات برای بررسی سوءاستفاده استفاده می‌شود.
            </div>
          </GlassCard>

          {session.note ? (
            <GlassCard className="p-5">
              <SectionTitle title="یادداشت" />
              <p className="text-xs leading-6">{session.note}</p>
            </GlassCard>
          ) : null}
        </div>
      </div>
    </>
  );
}

function Info({
  label,
  value,
  small,
  dir,
}: {
  label: string;
  value: string;
  small?: boolean;
  dir?: string | null;
}) {
  return (
    <div>
      <dt className="text-[10px] font-medium text-faint">{label}</dt>
      <dd className={`mt-0.5 break-all ${small ? "text-[11px] leading-5" : "text-sm"} font-semibold`} dir={dir === "ltr" ? "ltr" : undefined}>
        {value}
      </dd>
    </div>
  );
}

function SelfieBox({ url, label, deleted, hasPath }: { url: string | null; label: string; deleted: boolean; hasPath: boolean }) {
  if (!hasPath || deleted) {
    return (
      <div className="flex h-40 w-32 flex-col items-center justify-center gap-2 rounded-2xl bg-black/5 text-center dark:bg-white/5">
        <Badge tone="neutral">{deleted ? "حذف‌شده" : "بدون عکس"}</Badge>
        <span className="text-[10px] text-faint">{label}</span>
      </div>
    );
  }
  if (!url) {
    return <div className="h-40 w-32 rounded-2xl skeleton" aria-label={`${label} در حال بارگذاری`} />;
  }
  return (
    <figure>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={label} className="h-40 w-32 rounded-2xl object-cover ring-1 ring-black/10 dark:ring-white/10" />
      <figcaption className="mt-1 text-center text-[10px] text-faint">{label}</figcaption>
    </figure>
  );
}

function osmEmbedUrl(lat: number, lng: number): string {
  const d = 0.004;
  const bbox = `${lng - d}%2C${lat - d}%2C${lng + d}%2C${lat + d}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
}

function eventTypeFa(type: string): string {
  switch (type) {
    case "low_accuracy": return "دقت GPS پایین";
    case "out_of_range_attempt": return "تلاش خارج از محدوده";
    case "impossible_jump": return "جابه‌جایی غیرممکن";
    case "rapid_pattern": return "الگوی ثبت سریع مشکوک";
    default: return type;
  }
}

function adjustmentActionFa(action: string): string {
  switch (action) {
    case "add_checkout": return "افزودن خروج";
    case "adjust_checkin": return "اصلاح ورود";
    case "adjust_checkout": return "اصلاح خروج";
    case "excuse_absence": return "غیبت موجه";
    case "add_note": return "یادداشت";
    default: return action;
  }
}
