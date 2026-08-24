import { persianWeekdayIndex } from "@/lib/jalali";
import { timeInTz } from "@/lib/format";

export interface ScheduleInfo {
  workingDays: number[]; // Persian weekday index 0=شنبه..6=جمعه
  startTime: string | null; // "09:00"
  endTime: string | null;
  graceMinutes: number;
  expectedMinutes: number | null;
}

export function isWorkingDay(instant: Date, timeZone: string, workingDays: number[]): boolean {
  return workingDays.includes(persianWeekdayIndex(instant, timeZone));
}

function clockToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Late minutes = arrival beyond start_time minus grace. 0 otherwise. */
export function computeLateMinutes(
  checkinAt: Date,
  timeZone: string,
  sched: ScheduleInfo
): number {
  if (!sched.startTime || !isWorkingDay(checkinAt, timeZone, sched.workingDays)) return 0;
  const arrived = clockToMinutes(timeInTz(checkinAt, timeZone));
  return Math.max(0, Math.ceil(arrived - clockToMinutes(sched.startTime)) - sched.graceMinutes);
}

/** Early-departure minutes before end_time. */
export function computeEarlyLeaveMinutes(
  checkoutAt: Date,
  timeZone: string,
  sched: ScheduleInfo
): number {
  if (!sched.endTime || !isWorkingDay(checkoutAt, timeZone, sched.workingDays)) return 0;
  const left = clockToMinutes(timeInTz(checkoutAt, timeZone));
  return Math.max(0, Math.ceil(clockToMinutes(sched.endTime) - left));
}

/** Worked minutes and overtime between two instants. */
export function computeWorkedAndOvertime(
  checkinAt: Date,
  checkoutAt: Date,
  expectedMinutes: number | null
): { worked: number; overtime: number } {
  const worked = Math.max(0, Math.floor((checkoutAt.getTime() - checkinAt.getTime()) / 60_000));
  const overtime = expectedMinutes ? Math.max(0, worked - expectedMinutes) : 0;
  return { worked, overtime };
}
