"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminOrNull, requireAuth } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";
import type { LeaveDurationType, LeaveRequestStatus, LeaveType } from "@/lib/types";

export type ActionResult = { ok: true; id?: number } | { ok: false; error: string };

const submitLeaveSchema = z.object({
  leave_type: z.enum(["sick", "entitlement", "unpaid"]),
  duration_type: z.enum(["daily", "hourly"]),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().or(z.literal("")),
  end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().or(z.literal("")),
  description: z.string().trim().min(1, "توضیحات الزامی است.").max(2000),
});

const CODE_MESSAGES: Record<string, string> = {
  unauthenticated: "لطفاً وارد شوید.",
  inactive: "حساب کاربری غیرفعال است.",
  invalid_type: "نوع مرخصی نامعتبر است.",
  invalid_duration: "نوع مدت نامعتبر است.",
  description_required: "توضیحات الزامی است.",
  invalid_dates: "تاریخ پایان نمی‌تواند قبل از شروع باشد.",
  invalid_hourly: "برای مرخصی ساعتی، تاریخ شروع و پایان باید یکسان باشد.",
  invalid_time_range: "ساعت پایان باید بعد از ساعت شروع باشد.",
  forbidden: "دسترسی غیرمجاز.",
  not_found: "درخواست یافت نشد.",
  already_reviewed: "این درخواست قبلاً بررسی شده است.",
  invalid_action: "عملیات نامعتبر است.",
};

export async function submitLeaveAction(input: unknown): Promise<ActionResult> {
  await requireAuth();
  const parsed = submitLeaveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "اطلاعات نامعتبر است." };
  }

  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_leave_request", {
    p_leave_type: v.leave_type,
    p_duration_type: v.duration_type,
    p_start_date: v.start_date,
    p_end_date: v.end_date,
    p_start_time: v.duration_type === "hourly" ? `${v.start_time}:00` : null,
    p_end_time: v.duration_type === "hourly" ? `${v.end_time}:00` : null,
    p_description: v.description,
  });

  if (error) {
    console.error("[submitLeave]", error.message);
    return { ok: false, error: "ثبت درخواست ناموفق بود." };
  }

  const result = data as { ok: boolean; code?: string; id?: number };
  if (!result.ok) {
    return { ok: false, error: CODE_MESSAGES[result.code ?? ""] ?? "ثبت درخواست ناموفق بود." };
  }

  revalidatePath("/app/leave");
  revalidatePath("/admin/leave");
  return { ok: true, id: result.id };
}

export async function reviewLeaveAction(
  requestId: number,
  action: "approve" | "reject",
  adminNote?: string
): Promise<ActionResult> {
  const admin = await getAdminOrNull();
  if (!admin) return { ok: false, error: "دسترسی غیرمجاز." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("review_leave_request", {
    p_request_id: requestId,
    p_action: action,
    p_admin_note: adminNote ?? null,
  });

  if (error) {
    console.error("[reviewLeave]", error.message);
    return { ok: false, error: "بررسی درخواست ناموفق بود." };
  }

  const result = data as { ok: boolean; code?: string };
  if (!result.ok) {
    return { ok: false, error: CODE_MESSAGES[result.code ?? ""] ?? "بررسی درخواست ناموفق بود." };
  }

  await writeAudit(admin.profile.user_id, {
    action: action === "approve" ? "leave.approve" : "leave.reject",
    entity: "leave_requests",
    entityId: String(requestId),
    meta: { admin_note: adminNote ?? null },
  });

  revalidatePath("/admin/leave");
  revalidatePath("/app/leave");
  return { ok: true };
}

export interface LeaveBalance {
  year: number;
  sick_allowance: number;
  sick_used: number;
  sick_remaining: number;
  sick_exceeded: number;
  entitlement_allowance: number;
  entitlement_used: number;
  entitlement_remaining: number;
  entitlement_exceeded: number;
  unpaid_used: number;
}

export async function getLeaveBalance(profileId?: string): Promise<LeaveBalance | null> {
  const auth = await requireAuth();
  const targetId = profileId ?? auth.profile.user_id;

  if (profileId && profileId !== auth.profile.user_id && auth.profile.role !== "admin") {
    return null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("leave_balance", { p_profile: targetId });
  if (error || !data) return null;
  return data as LeaveBalance;
}

export interface LeaveRequestRow {
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
  reviewed_at: string | null;
  created_at: string;
  profiles?: { first_name: string; last_name: string; employee_code: string | null };
}

export async function getMyLeaveRequests(): Promise<LeaveRequestRow[]> {
  const auth = await requireAuth();
  const supabase = await createClient();
  const { data } = await supabase
    .from("leave_requests")
    .select("*")
    .eq("profile_id", auth.profile.user_id)
    .order("created_at", { ascending: false });
  return (data ?? []) as LeaveRequestRow[];
}

export async function getAllLeaveRequests(status?: LeaveRequestStatus): Promise<LeaveRequestRow[]> {
  const admin = await getAdminOrNull();
  if (!admin) return [];

  const supabase = await createClient();
  let q = supabase
    .from("leave_requests")
    .select("*, profiles!inner(first_name, last_name, employee_code)")
    .order("created_at", { ascending: false });

  if (status) q = q.eq("status", status);
  const { data } = await q;
  return (data ?? []) as LeaveRequestRow[];
}
