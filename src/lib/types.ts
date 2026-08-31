/** Database row types mirroring the SQL schema (supabase/migrations). */

export type UserRole = "admin" | "employee";
export type EmploymentStatus = "active" | "inactive";
export type SuspiciousType =
  | "low_accuracy"
  | "out_of_range_attempt"
  | "impossible_jump"
  | "rapid_pattern"
  | "repeated_failures";

export interface Profile {
  user_id: string;
  role: UserRole;
  first_name: string;
  last_name: string;
  employee_code: string | null;
  email: string | null;
  phone: string | null;
  avatar_path: string | null;
  employment_status: EmploymentStatus;
  hired_at: string | null; // date
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Workplace {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  radius_m: number;
  is_active: boolean;
  created_at: string;
}

export interface EmployeeWorkplace {
  profile_id: string;
  workplace_id: number;
  is_primary: boolean;
}

export interface WorkSchedule {
  id: number;
  name: string;
  working_days: number[]; // Persian weekday index 0=شنبه..6=جمعه
  start_time: string | null; // "09:00:00"
  end_time: string | null;
  grace_minutes: number;
  expected_hours: number | null;
  created_at: string;
}

export interface EmployeeSchedule {
  profile_id: string;
  schedule_id: number;
}

export interface AttendanceSession {
  id: number;
  profile_id: string;
  workplace_id: number | null;
  checkin_at: string;
  checkout_at: string | null;
  checkin_latitude: number | null;
  checkin_longitude: number | null;
  checkin_accuracy_m: number | null;
  checkin_distance_m: number | null;
  checkin_allowed_radius_m: number | null;
  checkout_latitude: number | null;
  checkout_longitude: number | null;
  checkout_accuracy_m: number | null;
  checkout_distance_m: number | null;
  checkout_allowed_radius_m: number | null;
  checkin_photo_path: string | null;
  checkout_photo_path: string | null;
  checkin_photo_deleted_at: string | null;
  checkout_photo_deleted_at: string | null;
  late_minutes: number;
  early_leave_minutes: number;
  worked_minutes: number | null;
  overtime_minutes: number;
  checkin_ip: string | null;
  checkin_user_agent: string | null;
  checkout_ip: string | null;
  checkout_user_agent: string | null;
  has_manual_adjustment: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export type LeaveType = "sick" | "entitlement" | "unpaid";
export type LeaveDurationType = "daily" | "hourly";
export type LeaveRequestStatus = "pending" | "approved" | "rejected";

export interface LeaveRequest {
  id: number;
  profile_id: string;
  leave_type: LeaveType;
  duration_type: LeaveDurationType;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  description: string;
  status: LeaveRequestStatus;
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface IranHoliday {
  id: number;
  holiday_date: string;
  title: string;
  is_holiday: boolean;
  jalali_year: number | null;
  fetched_at: string;
}

export interface AppSettings {
  id: boolean;
  organization_name: string;
  application_name: string;
  tagline: string;
  timezone: string;
  default_radius_m: number;
  max_gps_accuracy_m: number;
  selfie_retention_days: number;
  workweek_days: number[]; // Persian index 0=شنبه..6=جمعه
  default_work_hours: number;
  grace_minutes: number;
  annual_sick_days: number;
  annual_entitlement_days: number;
  logo_light_path: string | null;
  logo_dark_path: string | null;
  favicon_path: string | null;
  pwa_icon_path: string | null;
  theme_color: string;
  updated_at: string;
}

export interface SuspiciousEvent {
  id: number;
  profile_id: string;
  session_id: number | null;
  type: SuspiciousType;
  details: Record<string, unknown>;
  resolved: boolean;
  resolved_by: string | null;
  created_at: string;
}

export interface AuditLog {
  id: number;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

export interface AdminAdjustment {
  id: number;
  session_id: number;
  admin_id: string;
  action: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
}
