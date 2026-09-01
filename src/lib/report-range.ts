import "server-only";

import { dateToJalali, jalaliMonthLength, jalaliToGregorianDate, type JalaliDate } from "@/lib/jalali";
import { jalaliDayBoundsUTC } from "@/lib/format";

export interface ReportRange {
  from: JalaliDate;
  to: JalaliDate;
  fromISO: string;
  toISO: string;
}

function shiftDays(d: JalaliDate, days: number, timeZone: string): JalaliDate {
  const g = jalaliToGregorianDate(d.jy, d.jm, d.jd);
  return dateToJalali(new Date(g.getTime() + days * 86_400_000), timeZone);
}

function parseJalaliParam(s: string): JalaliDate | null {
  const [jy, jm, jd] = s.split("-").map(Number);
  if (!jy || !jm || !jd) return null;
  return { jy, jm, jd };
}

/** Timezone-aware Gregorian ISO bounds for a Jalali date range. */
export function jalaliRangeToIso(from: JalaliDate, to: JalaliDate, timezone: string): { fromISO: string; toISO: string } {
  const boundsFrom = jalaliDayBoundsUTC(from.jy, from.jm, from.jd, timezone);
  const boundsTo = jalaliDayBoundsUTC(to.jy, to.jm, to.jd, timezone);
  const fromISO = boundsFrom.start.toISOString().slice(0, 10);
  const toISO = new Date(boundsTo.end.getTime() - 1).toISOString().slice(0, 10);
  return { fromISO, toISO };
}

/**
 * Resolve report date range from URL search params and a preset key.
 * Uses timezone-aware conversion so page and export stay consistent.
 */
export function resolveReportRange(
  sp: { p?: string; from?: string; to?: string },
  timezone: string,
  now = new Date()
): ReportRange {
  const todayJ = dateToJalali(now, timezone);
  let from: JalaliDate = { ...todayJ };
  let to: JalaliDate = { ...todayJ };

  const preset = sp.p ?? "month";

  if (preset === "custom" && sp.from && sp.to) {
    const parsedFrom = parseJalaliParam(sp.from);
    const parsedTo = parseJalaliParam(sp.to);
    if (parsedFrom) from = parsedFrom;
    if (parsedTo) to = parsedTo;
  } else if (preset === "today") {
    from = { ...todayJ };
    to = { ...todayJ };
  } else if (preset === "week") {
    from = shiftDays(todayJ, -6, timezone);
    to = { ...todayJ };
  } else if (preset === "lastmonth") {
    const pm = todayJ.jm === 1 ? 12 : todayJ.jm - 1;
    const py = todayJ.jm === 1 ? todayJ.jy - 1 : todayJ.jy;
    from = { jy: py, jm: pm, jd: 1 };
    to = { jy: py, jm: pm, jd: jalaliMonthLength(py, pm) };
  } else {
    from = { jy: todayJ.jy, jm: todayJ.jm, jd: 1 };
    to = { ...todayJ };
  }

  const { fromISO, toISO } = jalaliRangeToIso(from, to, timezone);
  return { from, to, fromISO, toISO };
}
