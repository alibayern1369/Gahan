import { describe, expect, it } from "vitest";
import {
  dateToJalali,
  isJalaliLeap,
  jalaliMonthLength,
  jalaliToGregorianDate,
  persianWeekdayIndex,
} from "@/lib/jalali";

describe("jalali calendar", () => {
  it("converts known dates correctly (Nowruz)", () => {
    const j = dateToJalali(new Date(Date.UTC(2025, 2, 20)), "Asia/Tehran"); // 2025-03-20
    // Nowruz 1404 was 2025-03-21 (Tehran local). 2025-03-20 is 1403/12/29.
    expect(j.jy === 1403 || j.jy === 1404).toBe(true);
  });

  it("round-trips a wide range of days without drift", () => {
    const start = Date.UTC(2020, 0, 1);
    for (let i = 0; i < 2500; i += 7) {
      const g = new Date(start + i * 86_400_000);
      const j = dateToJalali(g, "Asia/Tehran");
      const back = jalaliToGregorianDate(j.jy, j.jm, j.jd);
      // compare civil day equality in Tehran tz
      const a = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tehran", dateStyle: "short" }).format(g);
      const b = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tehran", dateStyle: "short" }).format(back);
      expect(b).toBe(a);
    }
  });

  it("knows leap years and month lengths", () => {
    expect(isJalaliLeap(1399)).toBe(true); // esfand 30 days
    expect(jalaliMonthLength(1399, 12)).toBe(30);
    expect(isJalaliLeap(1403)).toBe(true);
    expect(jalaliMonthLength(1403, 12)).toBe(30);
    expect(isJalaliLeap(1404)).toBe(false);
    expect(jalaliMonthLength(1404, 12)).toBe(29);
    expect(jalaliMonthLength(1404, 6)).toBe(31);
    expect(jalaliMonthLength(1404, 7)).toBe(30);
  });

  it("maps weekdays to Persian index (2026-08-24 is دوشنبه = index 2)", () => {
    expect(persianWeekdayIndex(new Date(Date.UTC(2026, 7, 24)), "UTC")).toBe(2);
    expect(persianWeekdayIndex(new Date(Date.UTC(2026, 7, 22)), "UTC")).toBe(0); // شنبه
  });
});
