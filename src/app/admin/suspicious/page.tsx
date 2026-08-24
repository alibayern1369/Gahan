import { CheckCircle2, ShieldAlert } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { ResolveSuspiciousButton } from "@/components/admin/resolve-suspicious-button";
import { Badge } from "@/components/ui/badge";
import { GlassCard, SectionTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatJalaliDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  low_accuracy: "دقت GPS پایین",
  out_of_range_attempt: "تلاش ثبت خارج از محدوده",
  impossible_jump: "جابه‌جایی غیرممکن بین دو رکورد",
  rapid_pattern: "الگوی ثبت سریع غیرعادی",
  repeated_failures: "تلاش‌های ناموفق مکرر",
};

export default async function SuspiciousPage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data: events } = await supabase
    .from("suspicious_events")
    .select(
      `id, type, details, resolved, created_at,
       profiles(first_name, last_name, employee_code)`
    )
    .order("resolved", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(200);

  const rawList = (events ?? []) as unknown as Array<{
    id: number;
    type: string;
    details: Record<string, unknown>;
    resolved: boolean;
    created_at: string;
    profiles: { first_name: string; last_name: string; employee_code: string | null } | Array<{ first_name: string; last_name: string; employee_code: string | null }>;
  }>;

  const list = rawList.map((ev) => {
    const p = Array.isArray(ev.profiles) ? ev.profiles[0] : ev.profiles;
    return {
      id: ev.id,
      type: ev.type,
      details: (ev.details ?? {}) as Record<string, unknown>,
      resolved: ev.resolved,
      created_at: ev.created_at,
      profileName: `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim(),
    };
  });

  const open = list.filter((e) => !e.resolved);
  const closed = list.filter((e) => e.resolved);

  return (
    <>
      <AdminPageHeader
        title="رویدادهای مشکوک"
        subtitle="سیگنال‌های احتیاطی — برای بررسی انسانی؛ کاربران به‌صورت خودکار مسدود نمی‌شوند."
        action={<Badge tone={open.length > 0 ? "warning" : "success"}>{open.length.toLocaleString("fa-IR")} باز</Badge>}
      />

      <GlassCard className="overflow-hidden">
        <div className="border-b border-[color:var(--border-line)] p-5 pb-4">
          <SectionTitle title="باز" />
        </div>
        {open.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="رویداد بازی وجود ندارد" description="همهٔ سیگنال‌ها بررسی شده‌اند." />
        ) : (
          <ul className="divide-y divide-[color:var(--border-line)]">
            {open.map((ev) => (
              <li key={ev.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-bold">
                    <ShieldAlert className="size-4 text-amber-500" aria-hidden />
                    {TYPE_LABELS[ev.type] ?? ev.type}
                    <span className="font-normal text-secondary">— {ev.profileName}</span>
                  </p>
                  <p dir="ltr" className="mt-1 truncate text-left text-[11px] tabular-nums text-faint">
                    {formatJalaliDateTime(ev.created_at)} · {JSON.stringify(ev.details).slice(0, 120)}
                  </p>
                </div>
                <ResolveSuspiciousButton id={ev.id} />
              </li>
            ))}
          </ul>
        )}
      </GlassCard>

      {closed.length > 0 ? (
        <GlassCard className="mt-4 overflow-hidden opacity-75">
          <div className="border-b border-[color:var(--border-line)] p-5 pb-4">
            <SectionTitle title="بررسی‌شده" />
          </div>
          <ul className="divide-y divide-[color:var(--border-line)]">
            {closed.slice(0, 50).map((ev) => (
              <li key={ev.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <span className="text-xs font-semibold">
                  {TYPE_LABELS[ev.type] ?? ev.type} — {ev.profileName}
                </span>
                <Badge tone="success">رسیدگی شد</Badge>
              </li>
            ))}
          </ul>
        </GlassCard>
      ) : null}
    </>
  );
}
