import "server-only";
import { createClient } from "@/lib/supabase/server";
import { jalaliYmdToIso } from "@/lib/jalali";

export interface DashboardStats {
  today: string;
  total_active: number;
  present_today: number;
  absent_today: number;
  checked_out_today: number;
  late_today: number;
  still_on_site: number;
  avg_worked_week_minutes: number;
  open_suspicious: number;
}

export async function getDashboardStats(): Promise<DashboardStats | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dashboard_stats");
  if (error || !data) {
    console.error("[dashboard_stats]", error?.message);
    return null;
  }
  return data as DashboardStats;
}

export interface SessionRow {
  session_id: number;
  profile_id: string;
  full_name: string;
  employee_code: string | null;
  workplace_name: string | null;
  checkin_at: string;
  checkout_at: string | null;
  late_minutes: number;
  early_leave_minutes: number;
  worked_minutes: number | null;
  overtime_minutes: number;
  checkin_distance_m: number | null;
  allowed_radius_m: number | null;
  has_manual_adjustment: boolean;
  note: string | null;
  checkin_photo_path: string | null;
  checkout_photo_path: string | null;
  checkin_photo_deleted: boolean;
  checkout_photo_deleted: boolean;
  is_suspicious: boolean;
}

export interface JalaliYMD {
  jy: number;
  jm: number;
  jd: number;
}

/** Convert Jalali Y/M/D to a Gregorian 'YYYY-MM-DD' string for the SQL layer. */
export function jalaliToIsoDate(d: JalaliYMD): string {
  return jalaliYmdToIso(d);
}

/**
 * Fetch report rows through the security-definer SQL function.
 * Dates are inclusive Gregorian ISO strings derived from Jalali inputs.
 */
export async function getReportSessions(
  fromDateISO: string,
  toDateISO: string,
  employeeId?: string | null,
  workplaceId?: number | null
): Promise<SessionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_sessions", {
    p_from: fromDateISO,
    p_to: toDateISO,
    p_employee: employeeId ?? null,
    p_workplace: workplaceId ?? null,
  });
  if (error) {
    console.error("[report_sessions]", error.message);
    return [];
  }
  return (data ?? []) as unknown as SessionRow[];
}

export interface EmployeeSummaryRow {
  profile_id: string;
  full_name: string;
  employee_code: string | null;
  expected_days: number;
  present_days: number;
  absent_days: number;
  leave_days: number;
  late_days: number;
  late_minutes_total: number;
  early_leaves: number;
  missed_checkouts: number;
  worked_minutes_total: number;
  overtime_total: number;
}

export async function getEmployeeSummary(
  fromDateISO: string,
  toDateISO: string,
  employeeId?: string | null
): Promise<EmployeeSummaryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_employee_summary", {
    p_from: fromDateISO,
    p_to: toDateISO,
    p_employee: employeeId ?? null,
  });
  if (error) {
    console.error("[report_employee_summary]", error.message);
    return [];
  }
  return (data ?? []) as EmployeeSummaryRow[];
}

/** Filter session rows by status preset used in reports UI and export. */
export function filterSessionsByStatus(sessions: SessionRow[], status: string): SessionRow[] {
  return sessions.filter((s) => {
    if (status === "late") return s.late_minutes > 0;
    if (status === "open") return !s.checkout_at;
    if (status === "present") return !!s.checkin_at;
    return true;
  });
}

export interface ReportFilterOptions {
  employees: Array<{ user_id: string; name: string }>;
  workplaces: Array<{ id: number; name: string }>;
}

/** Employee/workplace lists for report filter dropdowns. */
export async function getReportFilterOptions(): Promise<ReportFilterOptions> {
  const supabase = await createClient();
  const [{ data: employeesRaw }, { data: workplacesRaw }] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id, first_name, last_name")
      .eq("role", "employee")
      .eq("employment_status", "active")
      .order("first_name"),
    supabase.from("workplaces").select("id, name").order("name"),
  ]);

  return {
    employees: (employeesRaw ?? []).map((e) => ({
      user_id: e.user_id as string,
      name: `${e.first_name} ${e.last_name}`,
    })),
    workplaces: (workplacesRaw ?? []).map((w) => ({
      id: w.id as number,
      name: w.name as string,
    })),
  };
}

/** Lightweight query for dashboard recent sessions — avoids heavy report_sessions RPC. */
export async function getRecentDashboardSessions(
  startISO: string,
  endISO: string,
  limit = 8
): Promise<SessionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance_sessions")
    .select(
      `
      id,
      profile_id,
      checkin_at,
      checkout_at,
      late_minutes,
      early_leave_minutes,
      worked_minutes,
      overtime_minutes,
      checkin_distance_m,
      checkin_allowed_radius_m,
      has_manual_adjustment,
      note,
      checkin_photo_path,
      checkout_photo_path,
      checkin_photo_deleted_at,
      checkout_photo_deleted_at,
      profiles!inner(first_name, last_name, employee_code),
      workplaces(name)
    `
    )
    .gte("checkin_at", startISO)
    .lt("checkin_at", endISO)
    .order("checkin_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[recent_sessions]", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const rawProfile = row.profiles as
      | { first_name: string; last_name: string; employee_code: string | null }
      | { first_name: string; last_name: string; employee_code: string | null }[]
      | null;
    const p = Array.isArray(rawProfile) ? rawProfile[0] : rawProfile;
    const rawWorkplace = row.workplaces as { name: string } | { name: string }[] | null;
    const w = Array.isArray(rawWorkplace) ? rawWorkplace[0] : rawWorkplace;
    return {
      session_id: row.id as number,
      profile_id: row.profile_id as string,
      full_name: p ? `${p.first_name} ${p.last_name}` : "—",
      employee_code: p?.employee_code ?? null,
      workplace_name: w?.name ?? null,
      checkin_at: row.checkin_at as string,
      checkout_at: row.checkout_at as string | null,
      late_minutes: row.late_minutes as number,
      early_leave_minutes: row.early_leave_minutes as number,
      worked_minutes: row.worked_minutes as number | null,
      overtime_minutes: row.overtime_minutes as number,
      checkin_distance_m: row.checkin_distance_m as number | null,
      allowed_radius_m: row.checkin_allowed_radius_m as number | null,
      has_manual_adjustment: row.has_manual_adjustment as boolean,
      note: row.note as string | null,
      checkin_photo_path: row.checkin_photo_path as string | null,
      checkout_photo_path: row.checkout_photo_path as string | null,
      checkin_photo_deleted: row.checkin_photo_deleted_at != null,
      checkout_photo_deleted: row.checkout_photo_deleted_at != null,
      is_suspicious: false,
    };
  });
}

/** Same-origin admin proxy URL for a private selfie (browser sends session cookies). */
export function getSelfieUrl(path: string): string | null {
  if (!path) return null;
  return `/api/admin/selfie?path=${encodeURIComponent(path)}`;
}
