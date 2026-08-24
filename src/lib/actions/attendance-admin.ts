"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminOrNull } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { jalaliToUTC } from "@/lib/format";
import { computeEarlyLeaveMinutes, computeLateMinutes, computeWorkedAndOvertime, type ScheduleInfo } from "@/lib/schedule-math";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

const adjustSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add_checkout"),
    session_id: z.number().int().positive(),
    jy: z.number().int().min(1300).max(1500),
    jm: z.number().int().min(1).max(12),
    jd: z.number().int().min(1).max(31),
    hh: z.number().int().min(0).max(23),
    mm: z.number().int().min(0).max(59),
    reason: z.string().trim().max(500).optional(),
  }),
  z.object({
    action: z.literal("adjust_checkin"),
    session_id: z.number().int().positive(),
    jy: z.number().int().min(1300).max(1500),
    jm: z.number().int().min(1).max(12),
    jd: z.number().int().min(1).max(31),
    hh: z.number().int().min(0).max(23),
    mm: z.number().int().min(0).max(59),
    reason: z.string().trim().max(500).optional(),
  }),
  z.object({
    action: z.literal("adjust_checkout"),
    session_id: z.number().int().positive(),
    jy: z.number().int().min(1300).max(1500),
    jm: z.number().int().min(1).max(12),
    jd: z.number().int().min(1).max(31),
    hh: z.number().int().min(0).max(23),
    mm: z.number().int().min(0).max(59),
    reason: z.string().trim().max(500).optional(),
  }),
  z.object({
    action: z.literal("excuse_absence"),
    profile_id: z.string().uuid(),
    jy: z.number().int().min(1300).max(1500),
    jm: z.number().int().min(1).max(12),
    jd: z.number().int().min(1).max(31),
    reason: z.string().trim().min(1).max(500),
  }),
  z.object({
    action: z.literal("add_note"),
    session_id: z.number().int().positive(),
    note: z.string().trim().min(1).max(1000),
  }),
]);

async function scheduleFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string
): Promise<ScheduleInfo | null> {
  const { data } = await supabase
    .from("employee_schedules")
    .select("schedule:work_schedules(working_days, start_time, end_time, grace_minutes, expected_hours)")
    .eq("profile_id", profileId)
    .maybeSingle<{
      schedule: {
        working_days: number[] | null;
        start_time: string | null;
        end_time: string | null;
        grace_minutes: number | null;
        expected_hours: number | null;
      } | null;
    }>();

  const s = data?.schedule;
  if (!s) return null;
  return {
    workingDays: s.working_days ?? [0, 1, 2, 3, 4],
    startTime: s.start_time ? s.start_time.slice(0, 5) : null,
    endTime: s.end_time ? s.end_time.slice(0, 5) : null,
    graceMinutes: s.grace_minutes ?? 10,
    expectedMinutes: s.expected_hours != null ? Math.round(Number(s.expected_hours) * 60) : null,
  };
}

/** All admin corrections are logged in audit_logs + admin_adjustments. */
export async function adjustAttendanceAction(input: unknown): Promise<ActionResult> {
  const adminCtx = await getAdminOrNull();
  if (!adminCtx) return { ok: false, error: "دسترسی غیرمجاز." };

  const parsed = adjustSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "اطلاعات اصلاح معتبر نیست." };
  const v = parsed.data;

  const supabase = await createClient();
  const now = new Date();

  if (v.action === "excuse_absence") {
    await supabase.from("admin_adjustments").insert({
      session_id: null,
      admin_id: adminCtx.profile.user_id,
      action: "excuse_absence",
      new_value: { profile_id: v.profile_id, date_jalali: `${v.jy}-${v.jm}-${v.jd}` },
      reason: v.reason,
    });
    await writeAudit(adminCtx.profile.user_id, {
      action: "attendance.excuse_absence",
      entity: "profiles",
      entityId: v.profile_id,
      newValue: { date: `${v.jy}-${v.jm}-${v.jd}`, reason: v.reason },
    });
    revalidatePath("/admin");
    return { ok: true };
  }

  const { data: session } = await supabase
    .from("attendance_sessions")
    .select("*")
    .eq("id", v.session_id)
    .maybeSingle();
  if (!session) return { ok: false, error: "رکورد حضور یافت نشد." };

  const tzSetting = (await getTz(supabase)) ?? "Asia/Tehran";
  const updates: Record<string, unknown> = {};
  let adjustmentOld: Record<string, unknown> = {};
  let adjustmentNew: Record<string, unknown> = {};

  if (v.action === "add_note") {
    updates.note = v.note;
    updates.has_manual_adjustment = true;
    adjustmentNew = { note: v.note };
    adjustmentOld = { note: session.note };

    const { error: noteErr } = await supabase
      .from("attendance_sessions")
      .update(updates)
      .eq("id", v.session_id);
    if (noteErr) return { ok: false, error: "اصلاح ناموفق بود." };

    await supabase.from("admin_adjustments").insert({
      session_id: v.session_id,
      admin_id: adminCtx.profile.user_id,
      action: "add_note",
      old_value: adjustmentOld,
      new_value: adjustmentNew,
      reason: null,
    });
    await writeAudit(adminCtx.profile.user_id, {
      action: "attendance.add_note",
      entity: "attendance_sessions",
      entityId: v.session_id,
      oldValue: adjustmentOld,
      newValue: adjustmentNew,
    });
    revalidatePath(`/admin/attendance/${v.session_id}`);
    return { ok: true };
  }

  const targetInstant = jalaliToUTC(v.jy, v.jm, v.jd, v.hh, v.mm, tzSetting);

  if (targetInstant.getTime() > now.getTime() + 5 * 60_000) {
    return { ok: false, error: "زمان انتخابی در آینده است." };
  }

  if (v.action === "add_checkout" || v.action === "adjust_checkout") {
    if (session.checkout_at && v.action === "add_checkout") {
      return { ok: false, error: "خروج این رکورد قبلاً ثبت شده است." };
    }
    if (targetInstant.getTime() <= new Date(session.checkin_at).getTime()) {
      return { ok: false, error: "خروج باید بعد از ورود باشد." };
    }
    const checkinAt = new Date(session.checkin_at);
    const sched = await scheduleFor(supabase, session.profile_id);
    const { worked, overtime } = computeWorkedAndOvertime(checkinAt, targetInstant, sched?.expectedMinutes ?? null);
    const early = sched ? computeEarlyLeaveMinutes(targetInstant, tzSetting, sched) : 0;
    updates.checkout_at = targetInstant.toISOString();
    updates.worked_minutes = worked;
    updates.overtime_minutes = overtime;
    updates.early_leave_minutes = early;
    adjustmentOld = { checkout_at: session.checkout_at };
    adjustmentNew = { checkout_at: targetInstant.toISOString(), worked_minutes: worked };
  }

  if (v.action === "adjust_checkin") {
    if (session.checkout_at && targetInstant.getTime() >= new Date(session.checkout_at).getTime()) {
      return { ok: false, error: "ورود باید قبل از خروج باشد." };
    }
    const sched = await scheduleFor(supabase, session.profile_id);
    const late = sched ? computeLateMinutes(targetInstant, tzSetting, sched) : 0;
    updates.checkin_at = targetInstant.toISOString();
    updates.late_minutes = late;
    if (session.checkout_at) {
      const { worked, overtime } = computeWorkedAndOvertime(
        targetInstant,
        new Date(session.checkout_at),
        sched?.expectedMinutes ?? null
      );
      updates.worked_minutes = worked;
      updates.overtime_minutes = overtime;
    }
    adjustmentOld = { checkin_at: session.checkin_at, late_minutes: session.late_minutes };
    adjustmentNew = { checkin_at: targetInstant.toISOString(), late_minutes: late };
  }

  updates.has_manual_adjustment = true;

  const { error: updError } = await supabase
    .from("attendance_sessions")
    .update(updates)
    .eq("id", v.session_id);
  if (updError) {
    console.error("[adjustAttendance]", updError.message);
    return { ok: false, error: "اصلاح ناموفق بود." };
  }

  await supabase.from("admin_adjustments").insert({
    session_id: v.session_id,
    admin_id: adminCtx.profile.user_id,
    action: v.action,
    old_value: adjustmentOld,
    new_value: adjustmentNew,
    reason: "reason" in v ? v.reason ?? null : null,
  });

  await writeAudit(adminCtx.profile.user_id, {
    action: `attendance.${v.action}`,
    entity: "attendance_sessions",
    entityId: v.session_id,
    oldValue: adjustmentOld,
    newValue: adjustmentNew,
  });

  revalidatePath(`/admin/attendance/${v.session_id}`);
  revalidatePath("/admin/today");
  return { ok: true };
}

async function getTz(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  const { data } = await supabase.from("app_settings").select("timezone").eq("id", true).maybeSingle();
  return data?.timezone ?? null;
}

export async function resolveSuspiciousAction(id: number): Promise<ActionResult> {
  const adminCtx = await getAdminOrNull();
  if (!adminCtx) return { ok: false, error: "دسترسی غیرمجاز." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("suspicious_events")
    .update({ resolved: true, resolved_by: adminCtx.profile.user_id })
    .eq("id", id);

  if (error) return { ok: false, error: "عملیات ناموفق بود." };

  await writeAudit(adminCtx.profile.user_id, {
    action: "suspicious.resolve",
    entity: "suspicious_events",
    entityId: id,
  });
  revalidatePath("/admin/suspicious");
  return { ok: true };
}
