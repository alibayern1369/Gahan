import { Suspense } from "react";
import Link from "next/link";
import { CalendarRange, FileBarChart } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { ReportsFilters } from "@/components/admin/reports-filters";
import { GlassCard, SectionTitle, StatCard } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  filterSessionsByStatus,
  getEmployeeSummary,
  getReportFilterOptions,
  getReportSessions,
} from "@/lib/reports";
import { resolveReportRange } from "@/lib/report-range";
import { dateToJalali } from "@/lib/jalali";
import { faNum, formatClockDuration, timeInTz } from "@/lib/format";
import { getSettings } from "@/lib/settings-server";

export const dynamic = "force-dynamic";

const DETAIL_LIMIT = 100;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; from?: string; to?: string; emp?: string; wp?: string; st?: string }>;
}) {
  const sp = await searchParams;
  const settings = await getSettings();
  const now = new Date();
  const todayJ = dateToJalali(now, settings.timezone);

  const { from, to, fromISO, toISO } = resolveReportRange(sp, settings.timezone, now);

  const employeeId = sp.emp || null;
  const workplaceId = sp.wp ? Number(sp.wp) : null;
  const status = sp.st ?? "all";

  const [summaries, sessions, filterOptions] = await Promise.all([
    getEmployeeSummary(fromISO, toISO, employeeId),
    getReportSessions(fromISO, toISO, employeeId, workplaceId),
    getReportFilterOptions(),
  ]);

  const filteredSessions = filterSessionsByStatus(sessions, status);

  // When filtering by workplace, narrow summary to employees with sessions in that workplace.
  const visibleSummaries =
    workplaceId && !employeeId
      ? summaries.filter((s) => sessions.some((sess) => sess.profile_id === s.profile_id))
      : summaries;

  const totals = visibleSummaries.reduce(
    (acc, r) => ({
      expected: acc.expected + Number(r.expected_days),
      present: acc.present + Number(r.present_days),
      absent: acc.absent + Number(r.absent_days),
      lateDays: acc.lateDays + Number(r.late_days),
      lateMinutes: acc.lateMinutes + Number(r.late_minutes_total),
      worked: acc.worked + Number(r.worked_minutes_total),
      overtime: acc.overtime + Number(r.overtime_total),
      missedOut: acc.missedOut + Number(r.missed_checkouts),
      early: acc.early + Number(r.early_leaves),
    }),
    { expected: 0, present: 0, absent: 0, lateDays: 0, lateMinutes: 0, worked: 0, overtime: 0, missedOut: 0, early: 0 }
  );

  const detailSessions = filteredSessions.slice(0, DETAIL_LIMIT);

  return (
    <>
      <AdminPageHeader title="گزارش‌ها" subtitle={`${faNum(from.jd)} ${monthName(from.jm)} ${faNum(from.jy)} تا ${faNum(to.jd)} ${monthName(to.jm)} ${faNum(to.jy)}`} />

      <Suspense fallback={<div className="skeleton h-24 rounded-2xl" />}>
        <div className="mb-5">
          <ReportsFilters
            options={{
              employees: filterOptions.employees,
              workplaces: filterOptions.workplaces,
              today: todayJ,
            }}
          />
        </div>
      </Suspense>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="روزهای کاری موردانتظار" value={faNum(totals.expected)} icon={<CalendarRange className="size-4" />} />
        <StatCard label="روزهای حاضر" value={faNum(totals.present)} tone="success" />
        <StatCard label="روزهای غایب" value={faNum(totals.absent)} tone={totals.absent > 0 ? "danger" : "default"} />
        <StatCard label="روزهای تأخیردار" value={faNum(totals.lateDays)} tone={totals.lateDays > 0 ? "warning" : "default"} />
        <StatCard label="مجموع دقایق تأخیر" value={formatClockDuration(totals.lateMinutes)} tone={totals.lateMinutes > 0 ? "warning" : "default"} />
        <StatCard label="مجموع کارکرد" value={formatClockDuration(totals.worked)} />
        <StatCard label="اضافه‌کار" value={formatClockDuration(totals.overtime)} tone="info" />
        <StatCard label="خروج زودهنگام" value={faNum(totals.early)} tone={totals.early > 0 ? "warning" : "default"} />
        <StatCard label="خروج ثبت‌نشده" value={faNum(totals.missedOut)} tone={totals.missedOut > 0 ? "danger" : "default"} />
      </div>

      <GlassCard className="mt-6 overflow-hidden">
        <div className="border-b border-[color:var(--border-line)] p-5 pb-4">
          <SectionTitle title="خلاصه به تفکیک کارمند" />
        </div>
        {visibleSummaries.length === 0 ? (
          <EmptyState icon={FileBarChart} title="داده‌ای برای این بازه نیست" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-160 text-sm">
              <thead>
                <tr className="border-b border-[color:var(--border-line)] text-right text-[11px] text-secondary">
                  {["کارمند", "انتظاری", "حاضر", "غایب", "تأخیر (روز)", "دقایق تأخیر", "کارکرد", "اضافه‌کار", "تعجیل", "بدون خروج"].map((h) => (
                    <th key={h} scope="col" className="px-4 py-3 font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--border-line)]">
                {visibleSummaries.map((r) => (
                  <tr key={r.profile_id} className="transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.03]">
                    <td className="px-4 py-3">
                      <Link href={`/admin/employees/${r.profile_id}`} className="font-bold hover:text-brand-500">
                        {r.full_name}
                      </Link>
                      {r.employee_code ? <span className="block text-[10px] text-faint">{r.employee_code}</span> : null}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{faNum(r.expected_days)}</td>
                    <td className="px-4 py-3 tabular-nums text-mint-600 dark:text-mint-400">{faNum(r.present_days)}</td>
                    <td className={`px-4 py-3 tabular-nums ${r.absent_days > 0 ? "text-rose-500 font-bold" : ""}`}>{faNum(r.absent_days)}</td>
                    <td className="px-4 py-3 tabular-nums">{faNum(r.late_days)}</td>
                    <td dir="ltr" className="px-4 py-3 tabular-nums text-right">{formatClockDuration(Number(r.late_minutes_total))}</td>
                    <td dir="ltr" className="px-4 py-3 tabular-nums text-right">{formatClockDuration(Number(r.worked_minutes_total))}</td>
                    <td dir="ltr" className="px-4 py-3 tabular-nums text-right">{formatClockDuration(Number(r.overtime_total))}</td>
                    <td className="px-4 py-3 tabular-nums">{faNum(r.early_leaves)}</td>
                    <td className="px-4 py-3 tabular-nums">{faNum(r.missed_checkouts)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      <GlassCard className="mt-4 overflow-hidden">
        <div className="border-b border-[color:var(--border-line)] p-5 pb-4">
          <SectionTitle
            title="رکوردهای تفصیلی"
            subtitle={
              filteredSessions.length > DETAIL_LIMIT
                ? `${faNum(filteredSessions.length)} رکورد — ${faNum(DETAIL_LIMIT)} رکورد اول نمایش داده می‌شود`
                : `${faNum(filteredSessions.length)} رکورد`
            }
            action={<Badge tone="brand">برای جزئیات روی ردیف کلیک کنید</Badge>}
          />
        </div>
        {filteredSessions.length === 0 ? (
          <EmptyState icon={FileBarChart} title="رکوردی یافت نشد" />
        ) : (
          <ul className="divide-y divide-[color:var(--border-line)]">
            {detailSessions.map((s) => (
              <li key={s.session_id}>
                <Link href={`/admin/attendance/${s.session_id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
                  <span className="min-w-36 text-sm font-bold">{s.full_name}</span>
                  <span dir="ltr" className="text-[11px] tabular-nums text-secondary">
                    {timeInTz(new Date(s.checkin_at), settings.timezone)} →{" "}
                    {s.checkout_at ? timeInTz(new Date(s.checkout_at), settings.timezone) : "..."}
                  </span>
                  <span className="flex items-center gap-1.5">
                    {s.late_minutes > 0 ? <Badge tone="warning">تأخیر {faNum(s.late_minutes)}</Badge> : null}
                    {s.is_suspicious ? <Badge tone="danger">مشکوک</Badge> : null}
                    {s.has_manual_adjustment ? <Badge tone="info">اصلاح‌شده</Badge> : null}
                    {!s.checkout_at ? <Badge>بدون خروج</Badge> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </>
  );
}

function monthName(jm: number): string {
  const names = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
  return names[jm - 1] ?? "";
}
