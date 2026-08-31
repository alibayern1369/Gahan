import { AdminPageHeader } from "@/components/admin/admin-shell";
import { SettingsForm, type SettingsValues } from "@/components/admin/settings-form";
import { BrandingPanel, CleanupTriggerButton, type BrandingSlot } from "@/components/admin/branding-panel";
import { BackupPanel } from "@/components/admin/backup-panel";
import { GlassCard, SectionTitle } from "@/components/ui/card";
import { brandingPublicUrl, getSettings } from "@/lib/settings-server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const tab =
    sp.tab === "branding"
      ? "branding"
      : sp.tab === "audit"
        ? "audit"
        : sp.tab === "backup"
          ? "backup"
          : "general";
  const settings = await getSettings();

  const slots: BrandingSlot[] = [
    {
      kind: "logo_light",
      title: "لوگوی حالت روشن",
      hint: "PNG/JPG/WebP/SVG تا ۵۱۲ کیلوبایت — در هدر و صفحهٔ ورود",
      accept: ".png,.jpg,.jpeg,.webp,.svg",
      currentUrl: brandingPublicUrl(settings.logo_light_path),
    },
    {
      kind: "logo_dark",
      title: "لوگوی حالت تاریک",
      hint: "PNG/JPG/WebP/SVG تا ۵۱۲ کیلوبایت — اگر خالی باشد از لوگوی روشن استفاده می‌شود",
      accept: ".png,.jpg,.jpeg,.webp,.svg",
      currentUrl: brandingPublicUrl(settings.logo_dark_path),
    },
    {
      kind: "favicon",
      title: "فاویکن (آیکون مرورگر)",
      hint: "PNG/SVG تا ۲۵۶ کیلوبایت — مربعی و حداقل ۶۴×۶۴",
      accept: ".png,.svg,.ico",
      currentUrl: brandingPublicUrl(settings.favicon_path),
    },
    {
      kind: "pwa_icon",
      title: "آیکون PWA (صفحهٔ اصلی گوشی)",
      hint: "فقط PNG تا ۵۱۲ کیلوبایت — حداقل ۵۱۲×۵۱۲ برای آیفون/اندروید",
      accept: ".png",
      currentUrl: brandingPublicUrl(settings.pwa_icon_path),
    },
  ];

  return (
    <>
      <AdminPageHeader
        title="تنظیمات"
        subtitle="پیکربندی عمومی، برندینگ گاهان و لاگ ممیزی"
      />

      <TabNav active={tab} />

      {tab === "general" ? (
        <div className="space-y-4">
          <SettingsForm
            initial={
              {
                organization_name: settings.organization_name,
                application_name: settings.application_name,
                tagline: settings.tagline,
                timezone: settings.timezone,
                default_radius_m: settings.default_radius_m,
                max_gps_accuracy_m: settings.max_gps_accuracy_m,
                selfie_retention_days: settings.selfie_retention_days,
                workweek_days: settings.workweek_days,
                default_work_hours: Number(settings.default_work_hours),
                grace_minutes: settings.grace_minutes,
                annual_sick_days: settings.annual_sick_days ?? 14,
                annual_entitlement_days: settings.annual_entitlement_days ?? 26,
              } satisfies SettingsValues
            }
          />
          <GlassCard className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <h3 className="text-sm font-bold">نگهداری عکس‌های سلفی</h3>
              <p className="mt-1 text-[11px] leading-5 text-secondary">
                فایل‌های قدیمی‌تر از {settings.selfie_retention_days.toLocaleString("fa-IR")} روز به‌صورت خودکار حذف می‌شوند؛ رکوردهای حضور باقی می‌مانند.
                زمان‌بندی خودکار روی Vercel Cron تنظیم شده است (هر روز یک بار).
              </p>
            </div>
            <CleanupTriggerButton />
          </GlassCard>
        </div>
      ) : null}

      {tab === "branding" ? (
        <BrandingPanel slots={slots} />
      ) : null}

      {tab === "audit" ? <AuditLog /> : null}

      {tab === "backup" ? <BackupPanel /> : null}
    </>
  );
}

function TabNav({ active }: { active: string }) {
  const tabs = [
    { key: "general", label: "عمومی" },
    { key: "branding", label: "برندینگ و لوگوها" },
    { key: "backup", label: "بکاپ و بازیابی" },
    { key: "audit", label: "لاگ ممیزی" },
  ];
  return (
    <nav aria-label="تب‌های تنظیمات" className="mb-5 flex flex-wrap gap-1.5">
      {tabs.map((t) => (
        <a
          key={t.key}
          href={`/admin/settings?tab=${t.key}`}
          aria-current={active === t.key ? "true" : undefined}
          className={`rounded-full px-4 py-2 text-xs font-bold transition-colors ${
            active === t.key
              ? "bg-brand-500/15 text-brand-600 ring-1 ring-inset ring-brand-500/30 dark:text-brand-300"
              : "glass text-secondary hover:text-brand-500"
          }`}
        >
          {t.label}
        </a>
      ))}
    </nav>
  );
}

async function AuditLog() {
  const supabase = await createClient();
  const { data: logs } = await supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(80);

  return (
    <GlassCard className="overflow-hidden">
      <div className="border-b border-[color:var(--border-line)] p-5 pb-4">
        <SectionTitle title="لاگ ممیزی" subtitle="۸۰ رویداد آخر — تمام تغییرات مدیریتی اینجا ثبت می‌شود." />
      </div>
      <ul className="divide-y divide-[color:var(--border-line)] text-xs">
        {(logs ?? []).map((log) => (
          <li key={log.id} className="px-5 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-brand-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-brand-600 dark:text-brand-300" dir="ltr">
                {log.action}
              </span>
              <span className="text-secondary">{log.entity}{log.entity_id ? `#${log.entity_id}` : ""}</span>
              <time dir="ltr" className="mr-auto text-[10px] tabular-nums text-faint">
                {new Date(log.created_at).toISOString().slice(0, 16).replace("T", " ")}Z
              </time>
            </div>
            {log.reason || log.meta ? null : null}
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}
