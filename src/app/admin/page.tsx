import Link from "next/link";
import {
  ActivitySquare,
  CalendarCheck2,
  Clock3,
  LogIn,
  LogOut,
  ShieldAlert,
  UserRoundX,
  Users,
} from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { BarChart, DonutChart } from "@/components/charts";
import { GlassCard, SectionTitle, StatCard } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getDashboardStats, getRecentDashboardSessions } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";
import { dateToJalali } from "@/lib/jalali";
import { faNum, formatClockDuration, timeInTz } from "@/lib/format";
import { getSettings } from "@/lib/settings-server";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const settings = await getSettings();
  const stats = await getDashboardStats();

  // last 7 days presence chart (local tz days)
  const supabase = await createClient();
  const now = new Date();
  const weekStart = new Date(now.getTime() - 6 * 24 * 3600_000);
  const { data: weekSessions } = await supabase
    .from("attendance_sessions")
    .select("checkin_at")
    .gte("checkin_at", weekStart.toISOString())
    .order("checkin_at", { ascending: true });

  const dayCounts = new Map<string, number>();
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(now.getTime() - i * 24 * 3600_000);
    const j = dateToJalali(d, settings.timezone);
    dayCounts.set(`${j.jy}-${j.jm}-${j.jd}`, 0);
  }
  for (const s of weekSessions ?? []) {
    const j = dateToJalali(new Date(s.checkin_at), settings.timezone);
    const key = `${j.jy}-${j.jm}-${j.jd}`;
    if (dayCounts.has(key)) dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
  }
  const chartData = Array.from(dayCounts.entries()).map(([key, value]) => {
    const [, , jd] = key.split("-").map(Number);
    return { label: faNum(jd), value, displayValue: faNum(value) };
  });

  // today's recent sessions
  const todayStats = stats ? await getTodayBounds(settings.timezone) : null;
  const sessions = todayStats
    ? await getRecentDashboardSessions(todayStats.startISO, todayStats.endISO, 8)
    : [];

  return (
    <>
      <AdminPageHeader title="داشبورد مدیریت" subtitle={`نمای کلی امروز — ${settings.organization_name}`} />

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="کارمندان فعال" value={faNum(stats?.total_active ?? "—")} icon={<Users className="size-4" />} />
        <StatCard
          label="حاضر امروز"
          value={faNum(stats?.present_today ?? "—")}
          icon={<CalendarCheck2 className="size-4" />}
          tone="success"
        />
        <StatCard
          label="غایب امروز"
          value={faNum(stats?.absent_today ?? "—")}
          icon={<UserRoundX className="size-4" />}
          tone={Number(stats?.absent_today ?? 0) > 0 ? "danger" : "default"}
        />
        <StatCard
          label="تأخیر امروز"
          value={faNum(stats?.late_today ?? "—")}
          icon={<Clock3 className="size-4" />}
          tone={Number(stats?.late_today ?? 0) > 0 ? "warning" : "success"}
        />
        <StatCard label="ورودهای امروز" value={faNum(sessions.filter((s) => s.checkin_at).length)} icon={<LogIn className="size-4" />} />
        <StatCard
          label="خروج‌های امروز"
          value={faNum(stats?.checked_out_today ?? "—")}
          icon={<LogOut className="size-4" />}
          tone="info"
        />
        <StatCard
          label="هم‌اکنون در محل کار"
          value={faNum(stats?.still_on_site ?? "—")}
          icon={<ActivitySquare className="size-4" />}
          tone="info"
        />
        <StatCard
          label="میانگین کارکرد هفته"
          value={formatClockDuration(Number(stats?.avg_worked_week_minutes ?? 0))}
          icon={<Clock3 className="size-4" />}
          hint="برای هر نفر، ۷ روز گذشته"
        />
      </div>

      {/* charts */}
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <GlassCard className="p-5 lg:col-span-2">
          <SectionTitle title="ورودهای ۷ روز گذشته" subtitle="تعداد رکورد ثبت‌شده در هر روز" />
          <BarChart data={chartData} />
        </GlassCard>

        <GlassCard className="p-5">
          <SectionTitle title="وضعیت امروز" subtitle="ترکیب حضور کارمندان" />
          <DonutChart
            centerLabel="حاضر امروز"
            centerValue={faNum(stats?.present_today ?? 0)}
            segments={[
              {
                label: "هم‌اکنون در محل کار",
                value: Number(stats?.still_on_site ?? 0),
                colorClass: "fill-mint-500 stroke-mint-500",
              },
              {
                label: "خروج زده",
                value: Math.max(0, Number(stats?.checked_out_today ?? 0)),
                colorClass: "fill-brand-500 stroke-brand-500",
              },
              {
                label: "غایب",
                value: Math.max(0, Number(stats?.absent_today ?? 0)),
                colorClass: "fill-rose-500/80 stroke-rose-500/80",
              },
            ]}
          />
        </GlassCard>
      </div>

      {stats && stats.open_suspicious > 0 ? (
        <Link href="/admin/suspicious" className="mt-4 block">
          <GlassCard className="flex items-center justify-between border border-amber-500/30 bg-amber-500/8 p-4">
            <span className="flex items-center gap-2 text-sm font-bold text-amber-600 dark:text-amber-400">
              <ShieldAlert className="size-5" aria-hidden />
              {faNum(stats.open_suspicious)} رویداد مشکوک بررسی‌نشده وجود دارد.
            </span>
            <Badge tone="warning">بررسی</Badge>
          </GlassCard>
        </Link>
      ) : null}

      {/* recent */}
      <div className="mt-6">
        <GlassCard className="overflow-hidden">
          <div className="border-b border-[color:var(--border-line)] p-5 pb-4">
            <SectionTitle
              title="آخرین رکوردهای امروز"
              action={
                <Link href="/admin/today" className="text-xs font-bold text-brand-500 hover:underline">
                  مشاهده همه →
                </Link>
              }
            />
          </div>
          {sessions.length === 0 ? (
            <EmptyState icon={CalendarCheck2} title="امروز رکوردی ثبت نشده است" description="به‌محض ثبت اولین ورود، اینجا نمایش داده می‌شود." />
          ) : (
            <ul className="divide-y divide-[color:var(--border-line)]">
              {sessions.slice(0, 8).map((s) => (
                <li key={s.session_id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{s.full_name}</p>
                    <p dir="ltr" className="mt-0.5 text-[11px] tabular-nums text-secondary text-left">
                      {timeInTz(new Date(s.checkin_at), settings.timezone)}
                      {" → "}
                      {s.checkout_at ? timeInTz(new Date(s.checkout_at), settings.timezone) : "..."}
                      {s.workplace_name ? ` — ${s.workplace_name}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {s.late_minutes > 0 ? <Badge tone="warning">تأخیر {faNum(s.late_minutes)}</Badge> : null}
                    {s.is_suspicious ? <Badge tone="danger">مشکوک</Badge> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      </div>
    </>
  );
}

async function getTodayBounds(timezone: string): Promise<{ startISO: string; endISO: string }> {
  const now = new Date();
  const j = dateToJalali(now, timezone);
  const { jalaliDayBoundsUTC } = await import("@/lib/format");
  const { start, end } = jalaliDayBoundsUTC(j.jy, j.jm, j.jd, timezone);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}
