import "server-only";
import { createClient } from "@/lib/supabase/server";
import { jalaliToGregorianDate } from "@/lib/jalali";

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

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Convert Jalali Y/M/D to a Gregorian 'YYYY-MM-DD' string for the SQL layer. */
export function jalaliToIsoDate(d: JalaliYMD): string {
  const g = jalaliToGregorianDate(d.jy, d.jm, d.jd);
  return `${g.getUTCFullYear()}-${pad(g.getUTCMonth() + 1)}-${pad(g.getUTCDate())}`;
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
  late_days: number;
  late_minutes_total: number;
  early_leaves: number;
  missed_checkouts: number;
  worked_minutes_total: number;
  overtime_total: number;
}

export async function getEmployeeSummary(
  fromDateISO: string,
  toDateISO: string
): Promise<EmployeeSummaryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_employee_summary", {
    p_from: fromDateISO,
    p_to: toDateISO,
  });
  if (error) {
    console.error("[report_employee_summary]", error.message);
    return [];
  }
  return (data ?? []) as EmployeeSummaryRow[];
}

/** Short-lived signed URL for a private selfie (admins/owners only per RLS). */
export async function getSelfieUrl(path: string, expiresIn = 300): Promise<string | null> {
  if (!path) return null;
  const supabase = await createClient();
  const { data } = await supabase.storage.from("selfies").createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}
