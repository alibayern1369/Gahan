import { describe, expect, it } from "vitest";
import { haversineDistanceMeters, isValidCoordinate } from "@/lib/geo";
import {
  computeEarlyLeaveMinutes,
  computeLateMinutes,
  computeWorkedAndOvertime,
  rotationCycleDay,
} from "@/lib/schedule-math";
import { faNum, formatClockDuration, formatDuration, jalaliDayBoundsUTC, jalaliToUTC } from "@/lib/format";
import { jalaliToGregorianDate } from "@/lib/jalali";

describe("geolocation", () => {
  it("returns zero for identical points", () => {
    expect(haversineDistanceMeters(35.7448, 51.3753, 35.7448, 51.3753)).toBeCloseTo(0, 3);
  });

  it("computes plausible Tehran → Karaj distance (~35–45 km)", () => {
    const d = haversineDistanceMeters(35.6892, 51.389, 35.8355, 50.9915);
    expect(d).toBeGreaterThan(35_000);
    expect(d).toBeLessThan(45_000);
  });

  it("validates coordinate ranges", () => {
    expect(isValidCoordinate(35.7, 51.3)).toBe(true);
    expect(isValidCoordinate(91, 0)).toBe(false);
    expect(isValidCoordinate(NaN, 10)).toBe(false);
  });
});

describe("schedule math", () => {
  const sched = {
    scheduleType: "fixed" as const,
    workingDays: [0, 1, 2, 3, 4], // شنبه تا چهارشنبه
    startTime: "09:00",
    endTime: "17:00",
    graceMinutes: 10,
    expectedMinutes: 480,
    rotationAnchorDate: null,
    morningStartTime: null,
    morningEndTime: null,
    eveningStartTime: null,
    eveningEndTime: null,
  };

  it("grants grace before counting lateness", () => {
    // 2026-08-24 is a Monday (دوشنبه = index 2) → working day
    const arrival = new Date(Date.UTC(2026, 7, 24, 5, 30)); // 09:00 Tehran (UTC+3:30)
    expect(computeLateMinutes(arrival, "Asia/Tehran", sched)).toBe(0);

    const arrival2 = new Date(Date.UTC(2026, 7, 24, 5, 45)); // 09:15 Tehran
    const late = computeLateMinutes(arrival2, "Asia/Tehran", sched);
    expect(late).toBe(5); // 15 - 10 grace
  });

  it("counts zero late on non-working days", () => {
    // Friday 2026-08-28 (جمعه index 6)
    const friday = new Date(Date.UTC(2026, 7, 28, 6, 0));
    expect(computeLateMinutes(friday, "Asia/Tehran", sched)).toBe(0);
  });

  it("computes early departure and worked/overtime", () => {
    const checkin = new Date(Date.UTC(2026, 7, 24, 5, 40)); // 09:10 Tehran
    const checkout = new Date(checkin.getTime() + 9 * 3600_000 + 20 * 60_000);
    const { worked, overtime } = computeWorkedAndOvertime(checkin, checkout, sched);
    expect(worked).toBe(560);
    expect(overtime).toBe(80);

    // leaving at 16:30 on working day → 30 min early
    const earlyOut = new Date(Date.UTC(2026, 7, 24, 13, 0)); // 16:30 Tehran
    expect(computeEarlyLeaveMinutes(earlyOut, "Asia/Tehran", sched)).toBe(30);
  });
});

describe("rotational schedule math", () => {
  const anchorG = jalaliToGregorianDate(1405, 6, 28);
  const anchorIso = `${anchorG.getUTCFullYear()}-${String(anchorG.getUTCMonth() + 1).padStart(2, "0")}-${String(anchorG.getUTCDate()).padStart(2, "0")}`;

  const rotational = {
    scheduleType: "rotational" as const,
    workingDays: [0, 1, 2, 3, 4, 5, 6],
    startTime: null,
    endTime: null,
    graceMinutes: 10,
    expectedMinutes: null,
    rotationAnchorDate: anchorIso,
    morningStartTime: "06:00",
    morningEndTime: "14:00",
    eveningStartTime: "14:00",
    eveningEndTime: "23:00",
  };

  it("cycles morning → evening → off from anchor", () => {
    const day1 = jalaliToGregorianDate(1405, 6, 28);
    const day2 = jalaliToGregorianDate(1405, 6, 29);
    const day3 = jalaliToGregorianDate(1405, 6, 30);
    const iso = (d: Date) =>
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    expect(rotationCycleDay(anchorIso, iso(day1))).toBe(0);
    expect(rotationCycleDay(anchorIso, iso(day2))).toBe(1);
    expect(rotationCycleDay(anchorIso, iso(day3))).toBe(2);
  });

  it("counts all evening overtime after shift end (crossing midnight)", () => {
    const checkin = jalaliToUTC(1405, 6, 29, 22, 0, "Asia/Tehran");
    const checkout = jalaliToUTC(1405, 6, 30, 3, 0, "Asia/Tehran");
    const { worked, overtime } = computeWorkedAndOvertime(checkin, checkout, rotational);
    expect(worked).toBe(300);
    expect(overtime).toBe(240);
  });

  it("counts full session as overtime on off days", () => {
    const checkin = jalaliToUTC(1405, 6, 30, 8, 0, "Asia/Tehran");
    const checkout = jalaliToUTC(1405, 6, 30, 12, 0, "Asia/Tehran");
    const { worked, overtime } = computeWorkedAndOvertime(checkin, checkout, rotational);
    expect(worked).toBe(240);
    expect(overtime).toBe(240);
  });
});

describe("formatting", () => {
  it("converts digits", () => {
    expect(faNum(1405)).toBe("۱۴۰۵");
    expect(faNum("12:34")).toBe("۱۲:۳۴");
  });

  it("formats durations", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(65)).toBe("۱ ساعت و ۵ دقیقه");
    expect(formatDuration(120)).toBe("۲ ساعت");
    expect(formatClockDuration(505)).toBe("۰۸:۲۵");
  });

  it("bounds a Jalali civil day to exactly 24h containing local midnight", () => {
    const { start, end } = jalaliDayBoundsUTC(1405, 6, 2, "Asia/Tehran"); // 2026-08-23/24-ish
    expect(end.getTime() - start.getTime()).toBe(24 * 3600_000);
    // start must equal Tehran-local midnight of that jalali day
    const localMidnight = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Tehran",
      dateStyle: "short",
      timeStyle: "short",
      hour12: false,
    }).format(start);
    expect(localMidnight.startsWith("8/")).toBe(true);
    expect(localMidnight.endsWith("00") || localMidnight.includes("00:00") || localMidnight.includes("12:00")).toBe(true);
  });
});
