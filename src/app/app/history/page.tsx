import { History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { GlassCard, SectionTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  dateToJalali,
  JALALI_MONTHS,
  PERSIAN_WEEKDAYS,
  persianWeekdayIndex,
} from "@/lib/jalali";
import { faNum, formatClockDuration, formatJalaliFull, timeInTz } from "@/lib/format";
import { getSettings } from "@/lib/settings-server";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; v?: string }>;
}) {
  const params = await searchParams;
  const { profile } = await requireAuth();
  const settings = await getSettings();
  const supabase = await createClient();

  const now = new Date();
  const j = dateToJalali(now, settings.timezone);
  const monthsBack = Math.min(12, Math.max(0, Number(params.m ?? "0") || 0));

  // resolve selected jalali month start/end as UTC instants
  let year = j.jy;
  let month = j.jm - monthsBack;
  while (month <= 0) {
    month += 12;
    year -= 1;
  }

  const monthStartGreg = new Date(Date.UTC(year - 621, month - 1, 1)); // approx; refined below via bounds of day 1..1
  void monthStartGreg;
  // precise bounds: first day of this jalali month → first day of next
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const { jalaliToGregorianDate } = await import("@/lib/jalali");
  const gStart = jalaliToGregorianDate(year, month, 1);
  const gEnd = jalaliToGregorianDate(nextYear, nextMonth, 1);

  const tzOffsetStart = tzOffset(gStart, settings.timezone);
  const tzOffsetEnd = tzOffset(gEnd, settings.timezone);
  const rangeStart = new Date(gStart.getTime() - tzOffsetStart * 60_000);
  const rangeEnd = new Date(gEnd.getTime() - tzOffsetEnd * 60_000);

  const isTodayView = params.v === "today";

  const { data: sessions } = await supabase
    .from("attendance_sessions")
    .select("*")
    .eq("profile_id", profile.user_id)
    .gte("checkin_at", isTodayView ? startOfToday(settings.timezone).toISOString() : rangeStart.toISOString())
    .lt("checkin_at", isTodayView ? endOfToday(settings.timezone).toISOString() : rangeEnd.toISOString())
    .order("checkin_at", { ascending: false })
    .limit(120);

  const rows = sessions ?? [];
  const totalWorked = rows.reduce((s, r) => s + (r.worked_minutes ?? 0), 0);
  const totalLate = rows.reduce((s, r) => s + (r.late_minutes ?? 0), 0);

  return (
    <div className="space-y-5 pb-6">
      <SectionTitle title="سوابق حضور و غیاب" subtitle={`${profile.first_name} ${profile.last_name}`} />

      {/* quick filters */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="بازه زمانی">
        <QuickFilter href="/app/history?v=today" active={isTodayView} label="امروز" />
        <QuickFilter href="/app/history?m=0" active={!isTodayView && monthsBack === 0} label="این ماه" />
        <QuickFilter href="/app/history?m=1" active={monthsBack === 1} label="ماه گذشته" />
        {monthsBack > 1 ? <QuickFilter href={`/app/history?m=${monthsBack}`} active label={`${JALALI_MONTHS[month - 1]} ${faNum(year)}`} /> : null}
      </div>

      {/* summary */}
      <GlassCard className="grid grid-cols-3 divide-x divide-x-reverse divide-[color:var(--border-line)] p-4 text-center">
        <SummaryCell label="روزهای ثبت‌شده" value={faNum(rows.length)} />
        <SummaryCell label="مجموع کارکرد" value={formatClockDuration(totalWorked)} />
        <SummaryCell label="مجموع تأخیر" value={formatClockDuration(totalLate)} tone={totalLate > 0 ? "warning" : undefined} />
      </GlassCard>

      {/* list */}
      {rows.length === 0 ? (
        <EmptyState icon={History} title="رکوردی یافت نشد" description="در این بازه حضور ثبت‌شده‌ای وجود ندارد." />
      ) : (
        <ul className="space-y-3">
          {rows.map((s) => {
            const d = new Date(s.checkin_at);
            const jd = dateToJalali(d, settings.timezone);
            return (
              <li key={s.id}>
                <GlassCard className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="text-sm font-bold">
                      {PERSIAN_WEEKDAYS[persianWeekdayIndex(d, settings.timezone)]} {faNum(jd.jd)}{" "}
                      {JALALI_MONTHS[jd.jm - 1]}
                    </p>
                    <p dir="ltr" className="mt-1 text-xs tabular-nums text-secondary">
                      {timeInTz(d, settings.timezone)} →{" "}
                      {s.checkout_at ? timeInTz(new Date(s.checkout_at), settings.timezone) : "—"}
                    </p>
                    {s.note ? <p className="mt-1 truncate text-[10px] text-faint">یادداشت مدیر: {s.note}</p> : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="text-xs font-bold tabular-nums">{formatClockDuration(s.worked_minutes)}</span>
                    {s.late_minutes > 0 ? (
                      <Badge tone="warning">تأخیر {faNum(s.late_minutes)} دقیقه</Badge>
                    ) : s.checkout_at ? (
                      <Badge tone="success">کامل</Badge>
                    ) : (
                      <Badge tone="info">در محل کار</Badge>
                    )}
                  </div>
                </GlassCard>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-center text-[11px] leading-5 text-faint">
        تاریخ امروز: {formatJalaliFull(now, settings.timezone)}
      </p>
    </div>
  );
}

function SummaryCell({ label, value, tone }: { label: string; value: string; tone?: "warning" }) {
  return (
    <div>
      <div className={`text-base font-extrabold tabular-nums ${tone === "warning" ? "text-amber-500" : ""}`}>{value}</div>
      <div className="mt-0.5 text-[10px] text-faint">{label}</div>
    </div>
  );
}

function QuickFilter({ href, label, active }: { href: string; label: string; active?: boolean }) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={!!active}
      className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
        active
          ? "bg-brand-500/15 text-brand-600 dark:text-brand-300 ring-1 ring-brand-500/30 ring-inset"
          : "glass text-secondary hover:text-brand-500"
      }`}
    >
      {label}
    </Link>
  );
}

function startOfToday(timeZone: string): Date {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((x) => x.type === t)?.value ?? "1");
  const utcNoonGuess = Date.UTC(get("year"), get("month") - 1, get("day"));
  const off = tzOffset(new Date(utcNoonGuess), timeZone);
  return new Date(utcNoonGuess - off * 60_000);
}

function endOfToday(timeZone: string): Date {
  return new Date(startOfToday(timeZone).getTime() + 24 * 3600_000);
}

function tzOffset(date: Date, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return Math.round((asUtc - date.getTime()) / 60_000);
}
