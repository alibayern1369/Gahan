import { JALALI_MONTHS, PERSIAN_WEEKDAYS, dateToJalali, jalaliToGregorianDate, persianWeekdayIndex } from "@/lib/jalali";

const faDigits = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

/** Convert latin digits in a string/number to Persian digits. */
export function faNum(value: string | number): string {
  return String(value).replace(/\d/g, (d) => faDigits[Number(d)]);
}

/** Format a number with Persian grouping digits, e.g. ۱۲٬۳۴۵ */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat("fa-IR").format(value);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** "09:05" style clock time from an instant in a timezone (latin digits). */
export function timeInTz(date: Date, timeZone = "Asia/Tehran"): string {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return fmt.format(date);
}

/** Full Jalali date like «دوشنبه ۲ شهریور ۱۴۰۵» */
export function formatJalaliFull(date: Date, timeZone = "Asia/Tehran"): string {
  const j = dateToJalali(date, timeZone);
  const wd = PERSIAN_WEEKDAYS[persianWeekdayIndex(date, timeZone)];
  return `${wd} ${faNum(j.jd)} ${JALALI_MONTHS[j.jm - 1]} ${faNum(j.jy)}`;
}

/** Short Jalali date like «۱۴۰۵/۰۶/۰۲» */
export function formatJalaliShort(date: Date, timeZone = "Asia/Tehran"): string {
  const j = dateToJalali(date, timeZone);
  return faNum(`${j.jy}/${pad2(j.jm)}/${pad2(j.jd)}`);
}

/** Jalali date + time like «۱۴۰۵/۰۶/۰۲ — ۰۹:۰۵» */
export function formatJalaliDateTime(date: Date | string, timeZone = "Asia/Tehran"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return `${formatJalaliShort(d, timeZone)} — ${faNum(timeInTz(d, timeZone))}`;
}

/** Duration in minutes → «۳ ساعت و ۲۵ دقیقه» or «—» */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes) || minutes < 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0 && m === 0) return "صفر";
  if (h === 0) return `${faNum(m)} دقیقه`;
  if (m === 0) return `${faNum(h)} ساعت`;
  return `${faNum(h)} ساعت و ${faNum(m)} دقیقه`;
}

/** HH:MM duration like «۰۸:۲۵» */
export function formatClockDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || minutes < 0) return "—";
  return faNum(`${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`);
}

/** Jalali month label like «شهریور ۱۴۰۵» */
export function jalaliMonthLabel(jy: number, jm: number): string {
  return `${JALALI_MONTHS[jm - 1]} ${faNum(jy)}`;
}

/**
 * UTC instants bounding a Jalali civil day [00:00, next 00:00) inside a timezone.
 * Handles DST correctly via the offset-at-instant technique.
 */
export function jalaliDayBoundsUTC(jy: number, jm: number, jd: number, timeZone: string): { start: Date; end: Date } {
  const noonGreg = jalaliToGregorianDate(jy, jm, jd); // UTC midnight of gregorian day
  // local midnight ≈ gregorian midnight minus timezone offset; refine using offset at noon
  const offsetAtNoon = tzOffsetMinutes(noonGreg, timeZone);
  let startMs = noonGreg.getTime() - offsetAtNoon * 60_000;
  // refine once with the offset at the computed instant
  const refinedOffset = tzOffsetMinutes(new Date(startMs + 3600_000), timeZone);
  startMs = noonGreg.getTime() - refinedOffset * 60_000;
  return { start: new Date(startMs), end: new Date(startMs + 24 * 3600_000) };
}

/**
 * Convert Jalali Y/M/D + clock time in a timezone to a UTC instant.
 */
export function jalaliToUTC(jy: number, jm: number, jd: number, hh: number, mm: number, timeZone: string): Date {
  const { start } = jalaliDayBoundsUTC(jy, jm, jd, timeZone);
  return new Date(start.getTime() + hh * 3600_000 + mm * 60_000);
}

/** Offset of timezone vs UTC in minutes at a given instant (positive east of UTC). */
export function tzOffsetMinutes(date: Date, timeZone: string): number {
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
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second")
  );
  return Math.round((asUtc - date.getTime()) / 60_000);
}
