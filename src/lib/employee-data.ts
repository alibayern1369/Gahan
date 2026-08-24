import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface TodayStatus {
  openSessionId: number | null;
  lastCheckinAt: string | null;
  lastCheckoutAt: string | null;
  todayWorkedMinutes: number;
  todayLateMinutes: number;
}

/** Latest session state for the current employee (server-side only). */
export async function getEmployeeToday(profileId: string): Promise<TodayStatus> {
  const supabase = await createClient();

  const { data: sessions } = await supabase
    .from("attendance_sessions")
    .select("id, checkin_at, checkout_at, late_minutes, worked_minutes")
    .eq("profile_id", profileId)
    .order("checkin_at", { ascending: false })
    .limit(10);

  const list = sessions ?? [];
  const open = list.find((s) => !s.checkout_at);

  let worked = 0;
  let late = 0;
  const firstOfDay = new Date();
  firstOfDay.setHours(0, 0, 0, 0);

  for (const s of list) {
    if (new Date(s.checkin_at) >= firstOfDay) {
      late += s.late_minutes ?? 0;
      if (s.checkout_at && s.worked_minutes != null) worked += s.worked_minutes;
    }
  }

  return {
    openSessionId: open?.id ?? null,
    lastCheckinAt: list[0]?.checkin_at ?? null,
    lastCheckoutAt: list.find((s) => s.checkout_at)?.checkout_at ?? null,
    todayWorkedMinutes: worked,
    todayLateMinutes: late,
  };
}

export interface EmployeeWorkContext {
  workplaceName: string | null;
  workplaceLat: number | null;
  workplaceLng: number | null;
  radiusM: number | null;
}

export async function getEmployeeWorkplace(profileId: string): Promise<EmployeeWorkContext> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("employee_workplaces")
    .select("workplaces(name, latitude, longitude, radius_m)")
    .eq("profile_id", profileId)
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle<{ workplaces: { name: string; latitude: number; longitude: number; radius_m: number } | null }>();

  const w = Array.isArray(data?.workplaces) ? data?.workplaces[0] : data?.workplaces;
  return w
    ? { workplaceName: w.name, workplaceLat: w.latitude, workplaceLng: w.longitude, radiusM: w.radius_m }
    : { workplaceName: null, workplaceLat: null, workplaceLng: null, radiusM: null };
}
