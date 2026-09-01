/**
 * Jalali (Persian) calendar conversion — pure TypeScript port of the
 * well-known Borkowski algorithm used by jalaali-js. Zero dependencies.
 * Internal timestamps are always stored as real UTC instants; conversion to
 * Jalali happens only at presentation boundaries.
 */

export interface JalaliDate {
  jy: number; // jalali year e.g. 1404
  jm: number; // month 1..12
  jd: number; // day 1..31
}

export const JALALI_MONTHS = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
] as const;

/** Persian weekday names indexed 0=شنبه … 6=جمعه */
export const PERSIAN_WEEKDAYS = [
  "شنبه",
  "یکشنبه",
  "دوشنبه",
  "سه‌شنبه",
  "چهارشنبه",
  "پنجشنبه",
  "جمعه",
] as const;

/** Short weekday labels for calendar headers */
export const PERSIAN_WEEKDAYS_SHORT = ["ش", "ی", "د", "س", "چ", "پ", "ج"] as const;

function div(a: number, b: number): number {
  return Math.trunc(a / b);
}

/** floor-mod */
function mod(a: number, b: number): number {
  return a - b * Math.floor(a / b);
}

interface JalCalResult {
  leap: number; // 0..4 ; 0 means leap year
  gy: number;
  march: number; // gregorian day of Farvardin 1st
}

const BREAKS = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 1701, 1749, 1770, 1786, 1805,
  1809, 1815, 1825, 1849, 1859, 1868, 1884, 1892, 1896, 1902, 1912, 1924, 1930, 1932, 1946,
  1952, 1960, 1966, 1972, 1978, 1984, 1988, 1992, 1996, 2000, 2004, 2008, 2012, 2016, 2020,
  2024, 2028, 2032, 2036, 2040, 2044, 2048, 2052, 2056, 2060, 2064, 2068, 2072, 2076, 2080,
  2084, 2088, 2092, 2096, 2100, 2112, 2124, 2136, 2148, 2160, 2172,
];

function jalCal(jy: number): JalCalResult {
  const bl = BREAKS.length;
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0];
  let jm = 0;
  let jump = 0;
  let leap = 0;

  if (jy < jp || jy >= BREAKS[bl - 1]) {
    throw new Error(`سال جلالی نامعتبر است: ${jy}`);
  }

  for (let i = 1; i < bl; i += 1) {
    jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;

  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;

  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;

  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;

  return { leap, gy, march };
}

function g2d(gy: number, gm: number, gd: number): number {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn: number): { gy: number; gm: number; gd: number } {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = Math.trunc(mod(j, 1461) / 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

/** Convert Gregorian Y/M/D to Jalali. */
export function toJalali(gy: number, gm: number, gd: number): JalaliDate {
  return d2j(g2d(gy, gm, gd));
}

function d2j(jdn: number): JalaliDate {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(r.gy, 3, r.march);

  let k = jdn - jdn1f;

  if (k >= 0) {
    if (k <= 185) {
      const jm2 = 1 + div(k, 31);
      const jd2 = Math.trunc(mod(k, 31)) + 1;
      return { jy, jm: jm2, jd: jd2 };
    }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  const jm = 7 + div(k, 30);
  const jd = Math.trunc(mod(k, 30)) + 1;
  return { jy, jm, jd };
}

function j2d(jy: number, jm: number, jd: number): number {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

/** Convert Jalali Y/M/D to Gregorian Date (UTC midnight). */
export function jalaliToGregorianDate(jy: number, jm: number, jd: number): Date {
  const jdn = j2d(jy, jm, jd);
  const g = d2g(jdn);
  return new Date(Date.UTC(g.gy, g.gm - 1, g.gd));
}

/** Is a Jalali year leap? */
export function isJalaliLeap(jy: number): boolean {
  return jalCal(jy).leap === 0;
}

/** Convert Jalali Y/M/D to a Gregorian ISO date string (YYYY-MM-DD). */
export function jalaliYmdToIso(d: JalaliDate): string {
  const g = jalaliToGregorianDate(d.jy, d.jm, d.jd);
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${g.getUTCFullYear()}-${pad(g.getUTCMonth() + 1)}-${pad(g.getUTCDate())}`;
}

/** Days in a Jalali month. */
export function jalaliMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isJalaliLeap(jy) ? 30 : 29;
}

/**
 * Convert a JS Date to a Jalali date interpreted in a given IANA timezone.
 */
export function dateToJalali(date: Date, timeZone = "Asia/Tehran"): JalaliDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((x) => x.type === t)?.value ?? "0");
  return toJalali(get("year"), get("month"), get("day"));
}

/** Persian weekday index for a JS Date in a timezone: 0=شنبه … 6=جمعه */
export function persianWeekdayIndex(date: Date, timeZone = "Asia/Tehran"): number {
  const dow = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(date);
  const map: Record<string, number> = { Sat: 0, Sun: 1, Mon: 2, Tue: 3, Wed: 4, Thu: 5, Fri: 6 };
  return map[dow] ?? 0;
}

/** Weekday index (0=شنبه) for a Jalali civil date. */
export function jalaliWeekdayIndex(jy: number, jm: number, jd: number): number {
  return persianWeekdayIndex(jalaliToGregorianDate(jy, jm, jd));
}

/** Compare two Jalali dates; negative if a < b. */
export function compareJalali(a: JalaliDate, b: JalaliDate): number {
  if (a.jy !== b.jy) return a.jy - b.jy;
  if (a.jm !== b.jm) return a.jm - b.jm;
  return a.jd - b.jd;
}

export function sameJalali(a: JalaliDate, b: JalaliDate): boolean {
  return a.jy === b.jy && a.jm === b.jm && a.jd === b.jd;
}

/** Add (or subtract) months, clamping day to month length. */
export function addJalaliMonths(d: JalaliDate, months: number): JalaliDate {
  let jm = d.jm + months;
  let jy = d.jy;
  while (jm > 12) {
    jm -= 12;
    jy += 1;
  }
  while (jm < 1) {
    jm += 12;
    jy -= 1;
  }
  return { jy, jm, jd: Math.min(d.jd, jalaliMonthLength(jy, jm)) };
}

/** Build a month grid with null padding cells; weeks start on Saturday. */
export function buildJalaliMonthGrid(jy: number, jm: number): Array<JalaliDate | null> {
  const len = jalaliMonthLength(jy, jm);
  const firstWd = jalaliWeekdayIndex(jy, jm, 1);
  const cells: Array<JalaliDate | null> = [];
  for (let i = 0; i < firstWd; i += 1) cells.push(null);
  for (let jd = 1; jd <= len; jd += 1) cells.push({ jy, jm, jd });
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
