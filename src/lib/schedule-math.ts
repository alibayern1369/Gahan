import { dateToJalali, jalaliToGregorianDate, persianWeekdayIndex } from "@/lib/jalali";
import { jalaliDayBoundsUTC, timeInTz } from "@/lib/format";

export type ScheduleType = "fixed" | "rotational";
export type RotationCycleDay = 0 | 1 | 2; // 0=morning, 1=evening, 2=off

export const ROTATION_CYCLE_LABELS = ["شیفت صبح", "شیفت عصر", "آف"] as const;

export interface ScheduleInfo {
  scheduleType: ScheduleType;
  workingDays: number[]; // Persian weekday index 0=شنبه..6=جمعه
  startTime: string | null; // "09:00"
  endTime: string | null;
  graceMinutes: number;
  expectedMinutes: number | null;
  rotationAnchorDate: string | null; // ISO yyyy-mm-dd
  morningStartTime: string | null;
  morningEndTime: string | null;
  eveningStartTime: string | null;
  eveningEndTime: string | null;
}

/** Days since anchor mod 3: 0=morning, 1=evening, 2=off */
export function rotationCycleDay(anchorIso: string, dateIso: string): RotationCycleDay {
  const anchor = parseIsoDate(anchorIso);
  const date = parseIsoDate(dateIso);
  const diff = Math.floor((date.getTime() - anchor.getTime()) / 86_400_000);
  return (((diff % 3) + 3) % 3) as RotationCycleDay;
}

export function rotationCycleDayFromInstant(
  anchorIso: string,
  instant: Date,
  timeZone: string
): RotationCycleDay {
  const j = dateToJalali(instant, timeZone);
  const g = jalaliToGregorianDate(j.jy, j.jm, j.jd);
  const iso = formatIsoDate(g);
  return rotationCycleDay(anchorIso, iso);
}

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatIsoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function isWorkingDay(instant: Date, timeZone: string, workingDays: number[]): boolean {
  return workingDays.includes(persianWeekdayIndex(instant, timeZone));
}

function clockToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function shiftTimesForCycle(sched: ScheduleInfo, cycle: RotationCycleDay): { start: string; end: string } | null {
  if (cycle === 0 && sched.morningStartTime && sched.morningEndTime) {
    return { start: sched.morningStartTime, end: sched.morningEndTime };
  }
  if (cycle === 1 && sched.eveningStartTime && sched.eveningEndTime) {
    return { start: sched.eveningStartTime, end: sched.eveningEndTime };
  }
  return null;
}

/** Shift end instant on the check-in calendar day (handles end < start crossing midnight). */
export function shiftEndInstantTz(
  checkinAt: Date,
  endTime: string,
  startTime: string,
  timeZone: string
): Date {
  const dayJ = dateToJalali(checkinAt, timeZone);
  const endM = clockToMinutes(endTime);
  const startM = clockToMinutes(startTime);
  let targetJ = { ...dayJ };
  if (endM < startM) {
    const next = jalaliToGregorianDate(dayJ.jy, dayJ.jm, dayJ.jd);
    const nextInstant = new Date(next.getTime() + 86_400_000);
    targetJ = dateToJalali(nextInstant, timeZone);
  }
  const [eh, em] = endTime.split(":").map(Number);
  const { start } = jalaliDayBoundsUTC(targetJ.jy, targetJ.jm, targetJ.jd, timeZone);
  return new Date(start.getTime() + eh * 3600_000 + em * 60_000);
}

/** Late minutes = arrival beyond start_time minus grace. 0 otherwise. */
export function computeLateMinutes(
  checkinAt: Date,
  timeZone: string,
  sched: ScheduleInfo
): number {
  if (sched.scheduleType === "rotational" && sched.rotationAnchorDate) {
    const cycle = rotationCycleDayFromInstant(sched.rotationAnchorDate, checkinAt, timeZone);
    if (cycle === 2) return 0;
    const shift = shiftTimesForCycle(sched, cycle);
    if (!shift) return 0;
    const arrived = clockToMinutes(timeInTz(checkinAt, timeZone));
    return Math.max(0, Math.ceil(arrived - clockToMinutes(shift.start)) - sched.graceMinutes);
  }

  if (!sched.startTime || !isWorkingDay(checkinAt, timeZone, sched.workingDays)) return 0;
  const arrived = clockToMinutes(timeInTz(checkinAt, timeZone));
  return Math.max(0, Math.ceil(arrived - clockToMinutes(sched.startTime)) - sched.graceMinutes);
}

/** Early-departure minutes before end_time. */
export function computeEarlyLeaveMinutes(
  checkoutAt: Date,
  timeZone: string,
  sched: ScheduleInfo,
  checkinAt?: Date
): number {
  if (sched.scheduleType === "rotational" && sched.rotationAnchorDate && checkinAt) {
    const cycle = rotationCycleDayFromInstant(sched.rotationAnchorDate, checkinAt, timeZone);
    if (cycle === 2) return 0;
    const shift = shiftTimesForCycle(sched, cycle);
    if (!shift) return 0;
    const endInstant = shiftEndInstantTz(checkinAt, shift.end, shift.start, timeZone);
    const diffMs = endInstant.getTime() - checkoutAt.getTime();
    return Math.max(0, Math.ceil(diffMs / 60_000));
  }

  if (!sched.endTime || !isWorkingDay(checkoutAt, timeZone, sched.workingDays)) return 0;
  const left = clockToMinutes(timeInTz(checkoutAt, timeZone));
  return Math.max(0, Math.ceil(clockToMinutes(sched.endTime) - left));
}

/** Worked minutes and overtime between two instants. */
export function computeWorkedAndOvertime(
  checkinAt: Date,
  checkoutAt: Date,
  sched: ScheduleInfo | null,
  timeZone = "Asia/Tehran"
): { worked: number; overtime: number } {
  const worked = Math.max(0, Math.floor((checkoutAt.getTime() - checkinAt.getTime()) / 60_000));

  if (!sched) return { worked, overtime: 0 };

  if (sched.scheduleType === "rotational" && sched.rotationAnchorDate) {
    const cycle = rotationCycleDayFromInstant(sched.rotationAnchorDate, checkinAt, timeZone);
    if (cycle === 2) return { worked, overtime: worked };
    const shift = shiftTimesForCycle(sched, cycle);
    if (!shift) return { worked, overtime: 0 };
    const endInstant = shiftEndInstantTz(checkinAt, shift.end, shift.start, timeZone);
    const overtime = Math.max(0, Math.floor((checkoutAt.getTime() - endInstant.getTime()) / 60_000));
    return { worked, overtime };
  }

  const overtime = sched.expectedMinutes ? Math.max(0, worked - sched.expectedMinutes) : 0;
  return { worked, overtime };
}

/** Whether a calendar date counts as a working day for leave / reports. */
export function isEmployeeWorkingDay(
  sched: ScheduleInfo | null,
  dateIso: string,
  defaultWeek: number[]
): boolean {
  if (!sched) {
    const d = parseIsoDate(dateIso);
    return defaultWeek.includes(persianWeekdayIndex(d, "Asia/Tehran"));
  }
  if (sched.scheduleType === "rotational" && sched.rotationAnchorDate) {
    return rotationCycleDay(sched.rotationAnchorDate, dateIso) !== 2;
  }
  const d = parseIsoDate(dateIso);
  return sched.workingDays.includes(persianWeekdayIndex(d, "Asia/Tehran"));
}
