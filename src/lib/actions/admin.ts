"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminOrNull } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { getServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

function persianError(message: string): string {
  if (message.includes("duplicate key") && message.includes("employee_code")) {
    return "این کد کارمندی قبلاً استفاده شده است.";
  }
  if (message.includes("duplicate key")) {
    return "این مقدار تکراری است.";
  }
  if (message.includes("foreign key") && message.includes("attendance_sessions")) {
    return "این مورد دارای سابقه حضور و غیاب است و قابل حذف نیست. می‌توانید آن را غیرفعال کنید.";
  }
  return "عملیات ناموفق بود. دوباره تلاش کنید.";
}

/* ============================================================
   Workplaces
   ============================================================ */

const workplaceSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(120),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radius_m: z.number().int().min(10).max(10000),
  is_active: z.boolean(),
});

export async function saveWorkplaceAction(input: unknown): Promise<ActionResult> {
  const admin = await getAdminOrNull();
  if (!admin) return { ok: false, error: "دسترسی غیرمجاز." };

  const parsed = workplaceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "اطلاعات محل کار معتبر نیست." };

  const supabase = await createClient();
  const { id, ...values } = parsed.data;

  let error;
  if (id) {
    ({ error } = await supabase.from("workplaces").update(values).eq("id", id));
  } else {
    ({ error } = await supabase.from("workplaces").insert(values));
  }

  if (error) {
    console.error("[saveWorkplace]", error.message);
    return { ok: false, error: persianError(error.message) };
  }

  await writeAudit(admin.profile.user_id, {
    action: id ? "workplace.update" : "workplace.create",
    entity: "workplaces",
    entityId: id ?? null,
    newValue: values,
  });

  revalidatePath("/admin/workplaces");
  return { ok: true };
}

export async function toggleWorkplaceAction(id: number, isActive: boolean): Promise<ActionResult> {
  const admin = await getAdminOrNull();
  if (!admin) return { ok: false, error: "دسترسی غیرمجاز." };

  const supabase = await createClient();
  const { error } = await supabase.from("workplaces").update({ is_active: isActive }).eq("id", id);
  if (error) return { ok: false, error: persianError(error.message) };

  await writeAudit(admin.profile.user_id, {
    action: "workplace.toggle",
    entity: "workplaces",
    entityId: id,
    newValue: { is_active: isActive },
  });
  revalidatePath("/admin/workplaces");
  return { ok: true };
}

export async function deleteWorkplaceAction(id: number): Promise<ActionResult> {
  const admin = await getAdminOrNull();
  if (!admin) return { ok: false, error: "دسترسی غیرمجاز." };

  const supabase = await createClient();

  const { count } = await supabase
    .from("attendance_sessions")
    .select("id", { count: "exact", head: true })
    .eq("workplace_id", id);

  if ((count ?? 0) > 0) {
    return { ok: false, error: "برای این محل کار سابقه ثبت شده است؛ فقط غیرفعال‌سازی ممکن است." };
  }

  // detach assignments first
  await supabase.from("employee_workplaces").delete().eq("workplace_id", id);
  const { error } = await supabase.from("workplaces").delete().eq("id", id);
  if (error) return { ok: false, error: persianError(error.message) };

  await writeAudit(admin.profile.user_id, {
    action: "workplace.delete",
    entity: "workplaces",
    entityId: id,
  });
  revalidatePath("/admin/workplaces");
  return { ok: true };
}

/* ============================================================
   Work schedules
   ============================================================ */

const scheduleSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(120),
  working_days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  grace_minutes: z.number().int().min(0).max(240),
  expected_hours: z.number().min(1).max(16).nullable(),
});

export async function saveScheduleAction(input: unknown): Promise<ActionResult> {
  const admin = await getAdminOrNull();
  if (!admin) return { ok: false, error: "دسترسی غیرمجاز." };

  const parsed = scheduleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "اطلاعات برنامه کاری معتبر نیست." };

  const supabase = await createClient();
  const { id, ...values } = parsed.data;

  let error;
  if (id) {
    ({ error } = await supabase.from("work_schedules").update(values).eq("id", id));
  } else {
    ({ error } = await supabase.from("work_schedules").insert(values));
  }
  if (error) return { ok: false, error: persianError(error.message) };

  await writeAudit(admin.profile.user_id, {
    action: id ? "schedule.update" : "schedule.create",
    entity: "work_schedules",
    entityId: id ?? null,
    newValue: values,
  });
  revalidatePath("/admin/schedules");
  return { ok: true };
}

export async function deleteScheduleAction(id: number): Promise<ActionResult> {
  const admin = await getAdminOrNull();
  if (!admin) return { ok: false, error: "دسترسی غیرمجاز." };

  const supabase = await createClient();
  const { error } = await supabase.from("work_schedules").delete().eq("id", id);
  if (error) {
    return { ok: false, error: "حذف ناموفق؛ این برنامه به کارمندانی اختصاص یافته است." };
  }
  await writeAudit(admin.profile.user_id, {
    action: "schedule.delete",
    entity: "work_schedules",
    entityId: id,
  });
  revalidatePath("/admin/schedules");
  return { ok: true };
}

/* ============================================================
   Employees
   ============================================================ */

const newEmployeeSchema = z.object({
  first_name: z.string().trim().min(1).max(80),
  last_name: z.string().trim().min(1).max(80),
  employee_code: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().email().max(200),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  hired_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  workplace_id: z.number().int().positive().nullable(),
  schedule_id: z.number().int().positive().nullable(),
});

const editEmployeeSchema = newEmployeeSchema.omit({ email: true }).extend({
  user_id: z.string().uuid(),
  email: z.string().email().max(200),
  employment_status: z.enum(["active", "inactive"]),
  reset_password: z.boolean(),
});

function generateTempPassword(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  let out = "";
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < bytes.length; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

/** Creates the auth user + profile + assignments. Returns a one-time temp password. */
export async function createEmployeeAction(
  input: unknown
): Promise<{ ok: true; tempPassword: string } | { ok: false; error: string }> {
  const adminCtx = await getAdminOrNull();
  if (!adminCtx) return { ok: false, error: "دسترسی غیرمجاز." };

  const parsed = newEmployeeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "اطلاعات کارمند معتبر نیست." };

  const v = parsed.data;
  const service = getServiceClient();
  const tempPassword = generateTempPassword();

  const { data: created, error: createError } = await service.auth.admin.createUser({
    email: v.email.toLowerCase(),
    password: tempPassword,
    email_confirm: true,
  });

  if (createError || !created.user) {
    console.error("[createEmployee/auth]", createError?.message);
    const msg = String(createError?.message ?? "");
    if (msg.includes("already registered") || msg.includes("already exists")) {
      return { ok: false, error: "این ایمیل قبلاً ثبت شده است." };
    }
    return { ok: false, error: "ساخت حساب کاربری ناموفق بود." };
  }

  const supabase = await createClient();
  const { error: profileError } = await supabase.from("profiles").insert({
    user_id: created.user.id,
    role: "employee",
    first_name: v.first_name,
    last_name: v.last_name,
    employee_code: v.employee_code || null,
    email: v.email.toLowerCase(),
    phone: v.phone || null,
    hired_at: v.hired_at || null,
    notes: v.notes || null,
    employment_status: "active",
  });

  if (profileError) {
    // rollback auth user to avoid orphans
    await service.auth.admin.deleteUser(created.user.id);
    console.error("[createEmployee/profile]", profileError.message);
    return { ok: false, error: persianError(profileError.message) };
  }

  if (v.workplace_id) {
    await supabase.from("employee_workplaces").insert({
      profile_id: created.user.id,
      workplace_id: v.workplace_id,
      is_primary: true,
    });
  }
  if (v.schedule_id) {
    await supabase.from("employee_schedules").insert({
      profile_id: created.user.id,
      schedule_id: v.schedule_id,
    });
  }

  await writeAudit(adminCtx.profile.user_id, {
    action: "employee.create",
    entity: "profiles",
    entityId: created.user.id,
    newValue: { email: v.email, name: `${v.first_name} ${v.last_name}` },
  });

  revalidatePath("/admin/employees");
  return { ok: true, tempPassword };
}

export async function updateEmployeeAction(
  input: unknown
): Promise<{ ok: true; tempPassword?: string } | { ok: false; error: string }> {
  const adminCtx = await getAdminOrNull();
  if (!adminCtx) return { ok: false, error: "دسترسی غیرمجاز." };

  const parsed = editEmployeeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "اطلاعات کارمند معتبر نیست." };

  const v = parsed.data;
  const supabase = await createClient();
  let tempPassword: string | undefined;

  const { data: before } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", v.user_id)
    .maybeSingle();
  if (!before) return { ok: false, error: "کارمند یافت نشد." };

  const { error: updError } = await supabase
    .from("profiles")
    .update({
      first_name: v.first_name,
      last_name: v.last_name,
      employee_code: v.employee_code || null,
      email: v.email.toLowerCase(),
      phone: v.phone || null,
      hired_at: v.hired_at || null,
      notes: v.notes || null,
      employment_status: v.employment_status,
    })
    .eq("user_id", v.user_id);

  if (updError) return { ok: false, error: persianError(updError.message) };

  if (before.email !== v.email.toLowerCase()) {
    const service = getServiceClient();
    const { error: emailError } = await service.auth.admin.updateUserById(v.user_id, {
      email: v.email.toLowerCase(),
    });
    if (emailError) console.error("[updateEmployee/email]", emailError.message);
  }

  if (v.reset_password) {
    const service = getServiceClient();
    const newPassword = generateTempPassword();
    const { error: pwError } = await service.auth.admin.updateUserById(v.user_id, {
      password: newPassword,
    });
    if (pwError) {
      console.error("[updateEmployee/password]", pwError.message);
      return { ok: false, error: "ویرایش انجام شد اما بازنشانی گذرواژه ناموفق بود." };
    }
    tempPassword = newPassword;
    await writeAudit(adminCtx.profile.user_id, {
      action: "employee.reset_password",
      entity: "profiles",
      entityId: v.user_id,
      meta: { note: "password regenerated — delivered out of band" },
    });
  }

  if (v.workplace_id) {
    await supabase.from("employee_workplaces").delete().eq("profile_id", v.user_id);
    await supabase.from("employee_workplaces").insert({
      profile_id: v.user_id,
      workplace_id: v.workplace_id,
      is_primary: true,
    });
  } else {
    await supabase.from("employee_workplaces").delete().eq("profile_id", v.user_id);
  }

  await supabase.from("employee_schedules").delete().eq("profile_id", v.user_id);
  if (v.schedule_id) {
    await supabase
      .from("employee_schedules")
      .insert({ profile_id: v.user_id, schedule_id: v.schedule_id });
  }

  await writeAudit(adminCtx.profile.user_id, {
    action: "employee.update",
    entity: "profiles",
    entityId: v.user_id,
    oldValue: before as Record<string, unknown>,
    newValue: v as unknown as Record<string, unknown>,
  });

  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${v.user_id}`);
  return { ok: true, tempPassword };
}
