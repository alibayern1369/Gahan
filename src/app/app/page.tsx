import { CalendarDays, Clock3, MapPin, Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { GlassCard, StatCard } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { AttendanceFlow } from "@/components/attendance/attendance-flow";
import { requireAuth } from "@/lib/auth";
import { formatDuration, formatJalaliDateTime, formatJalaliFull, timeInTz } from "@/lib/format";
import { getEmployeeToday, getEmployeeWorkplaces } from "@/lib/employee-data";
import { getSettings } from "@/lib/settings-server";

export const dynamic = "force-dynamic";

export default async function EmployeeHomePage() {
  const { profile } = await requireAuth();
  const [settings, today, workContext] = await Promise.all([
    getSettings(),
    getEmployeeToday(profile.user_id),
    getEmployeeWorkplaces(profile.user_id),
  ]);
  const workplaces = workContext.workplaces;
  const workplaceLabel =
    workplaces.length === 0
      ? null
      : workplaces.length === 1
        ? workplaces[0].name
        : `${workplaces.length.toLocaleString("fa-IR")} محل`;

  const isCheckedIn = today.openSessionId !== null;
  const now = new Date();
  const liveMinutes =
    isCheckedIn && today.lastCheckinAt
      ? Math.floor((now.getTime() - new Date(today.lastCheckinAt).getTime()) / 60_000)
      : 0;

  return (
    <div className="space-y-5 pb-6">
      {/* Greeting */}
      <section aria-label="خوش‌آمد">
        <p className="text-xs text-secondary">{formatJalaliFull(now, settings.timezone)}</p>
        <h1 className="mt-1 text-xl font-extrabold">
          سلام، {profile.first_name} {profile.last_name} 👋
        </h1>
      </section>

      {/* Status card */}
      <GlassCard strong className="p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-secondary">وضعیت فعلی شما</span>
          {isCheckedIn ? (
            <Badge tone="success">در محل کار</Badge>
          ) : (
            <Badge tone={today.todayWorkedMinutes > 0 ? "info" : "neutral"}>
              {today.todayWorkedMinutes > 0 ? "خروج ثبت شد" : "ثبت نشده"}
            </Badge>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl bg-black/[0.03] p-3 dark:bg-white/[0.04]">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-mint-600 dark:text-mint-400">
              <Clock3 className="size-3.5" aria-hidden /> آخرین ورود
            </div>
            <p className="mt-1.5 font-bold tabular-nums" dir="ltr">
              {today.lastCheckinAt ? timeInTz(new Date(today.lastCheckinAt), settings.timezone) : "—"}
            </p>
          </div>
          <div className="rounded-2xl bg-black/[0.03] p-3 dark:bg-white/[0.04]">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-rose-500">
              <Clock3 className="size-3.5 rotate-180" aria-hidden /> آخرین خروج
            </div>
            <p className="mt-1.5 font-bold tabular-nums" dir="ltr">
              {today.lastCheckoutAt ? timeInTz(new Date(today.lastCheckoutAt), settings.timezone) : "—"}
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between rounded-2xl bg-brand-500/8 px-4 py-3">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-brand-600 dark:text-brand-300">
            <Timer className="size-4" aria-hidden />
            {isCheckedIn ? "مدت حضور امروز (زنده)" : "مجموع کار امروز"}
          </span>
          <span className="text-sm font-extrabold tabular-nums">
            {formatDuration(isCheckedIn ? liveMinutes : today.todayWorkedMinutes)}
          </span>
        </div>
      </GlassCard>

      {/* Primary action */}
      <AttendanceFlow
        nextAction={isCheckedIn ? "check_out" : "check_in"}
        maxAccuracy={settings.max_gps_accuracy_m}
        timezone={settings.timezone}
        userId={profile.user_id}
        workplaces={workplaces}
      />

      {/* Context cards */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="محل کاری من"
          value={<span className="text-base">{workplaceLabel ?? "تعیین نشده"}</span>}
          icon={<MapPin className="size-4" />}
        />
        <StatCard
          label="تأخیر امروز"
          value={today.todayLateMinutes > 0 ? formatDuration(today.todayLateMinutes) : "ندارم"}
          icon={<CalendarDays className="size-4" />}
          tone={today.todayLateMinutes > 0 ? "warning" : "success"}
        />
      </div>

      {!workplaceLabel ? (
        <EmptyState
          icon={MapPin}
          title="محل کاری تعیین نشده"
          description="برای ثبت حضور باید مدیر سامانه یک محل کاری برای شما تعیین کند."
        />
      ) : null}

      {today.lastCheckinAt && !isCheckedIn ? (
        <p className="text-center text-[11px] text-faint">
          آخرین رکورد: {formatJalaliDateTime(today.lastCheckinAt, settings.timezone)}
        </p>
      ) : null}
    </div>
  );
}
