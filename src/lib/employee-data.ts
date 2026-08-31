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

export interface EmployeeWorkplaceItem {
  name: string;
  latitude: number;
  longitude: number;
  radiusM: number;
}

export interface EmployeeWorkContext {
  workplaces: EmployeeWorkplaceItem[];
}

export async function getEmployeeWorkplaces(profileId: string): Promise<EmployeeWorkContext> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("employee_workplaces")
    .select("is_primary, workplaces(name, latitude, longitude, radius_m, is_active)")
    .eq("profile_id", profileId)
    .order("is_primary", { ascending: false });

  const workplaces: EmployeeWorkplaceItem[] = [];
  for (const row of data ?? []) {
    const wp = Array.isArray(row.workplaces) ? row.workplaces[0] : row.workplaces;
    if (!wp || !wp.is_active) continue;
    workplaces.push({
      name: wp.name,
      latitude: wp.latitude,
      longitude: wp.longitude,
      radiusM: wp.radius_m,
    });
  }

  return { workplaces };
}

/** @deprecated use getEmployeeWorkplaces */
export async function getEmployeeWorkplace(profileId: string) {
  const { workplaces } = await getEmployeeWorkplaces(profileId);
  const first = workplaces[0];
  return {
    workplaceName: first?.name ?? null,
    workplaceLat: first?.latitude ?? null,
    workplaceLng: first?.longitude ?? null,
    radiusM: first?.radiusM ?? null,
  };
}
