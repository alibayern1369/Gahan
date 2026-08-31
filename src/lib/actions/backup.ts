"use server";

import { revalidatePath } from "next/cache";
import { getAdminOrNull } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { getServiceClient } from "@/lib/supabase/service";
import { syncIranHolidaysToDb } from "@/lib/iran-holidays";

export type ActionResult = { ok: true } | { ok: false; error: string };

const BACKUP_VERSION = 1;

const TABLES = [
  "app_settings",
  "profiles",
  "workplaces",
  "employee_workplaces",
  "work_schedules",
  "employee_schedules",
  "attendance_sessions",
  "photo_uploads",
  "admin_adjustments",
  "audit_logs",
  "suspicious_events",
  "iran_holidays",
  "leave_requests",
] as const;

export interface BackupPayload {
  version: number;
  exported_at: string;
  tables: Record<string, unknown[]>;
  auth_users: {
    id: string;
    email: string;
    username: string;
    role: string;
  }[];
  storage_selfies: { path: string; base64: string }[];
  storage_branding: { path: string; base64: string }[];
}

async function downloadStorageFiles(
  bucket: string,
  paths: string[]
): Promise<{ path: string; base64: string }[]> {
  const service = getServiceClient();
  const results: { path: string; base64: string }[] = [];

  for (const path of paths) {
    if (!path) continue;
    try {
      const { data, error } = await service.storage.from(bucket).download(path);
      if (error || !data) continue;
      const buf = Buffer.from(await data.arrayBuffer());
      results.push({ path, base64: buf.toString("base64") });
    } catch {
      // skip missing files
    }
  }
  return results;
}

export async function exportBackupAction(): Promise<
  { ok: true; data: BackupPayload } | { ok: false; error: string }
> {
  const admin = await getAdminOrNull();
  if (!admin) return { ok: false, error: "دسترسی غیرمجاز." };

  const service = getServiceClient();
  const tables: Record<string, unknown[]> = {};

  for (const table of TABLES) {
    const { data, error } = await service.from(table).select("*");
    if (error) {
      console.error(`[backup] ${table}`, error.message);
      return { ok: false, error: `خطا در خواندن جدول ${table}.` };
    }
    tables[table] = data ?? [];
  }

  const { data: authData } = await service.auth.admin.listUsers({ perPage: 1000 });
  const authUsers = (authData?.users ?? []).map((u) => ({
    id: u.id,
    email: u.email ?? "",
    username: (u.email ?? "").split("@")[0],
    role: u.role ?? "authenticated",
  }));

  const selfiePaths = new Set<string>();
  const brandingPaths = new Set<string>();

  for (const row of tables.attendance_sessions as { checkin_photo_path?: string; checkout_photo_path?: string }[]) {
    if (row.checkin_photo_path) selfiePaths.add(row.checkin_photo_path);
    if (row.checkout_photo_path) selfiePaths.add(row.checkout_photo_path);
  }
  for (const row of tables.photo_uploads as { path?: string }[]) {
    if (row.path) selfiePaths.add(row.path);
  }
  const settings = tables.app_settings[0] as Record<string, string | null> | undefined;
  if (settings) {
    for (const key of ["logo_light_path", "logo_dark_path", "favicon_path", "pwa_icon_path"]) {
      if (settings[key]) brandingPaths.add(settings[key] as string);
    }
  }

  const [storage_selfies, storage_branding] = await Promise.all([
    downloadStorageFiles("selfies", Array.from(selfiePaths)),
    downloadStorageFiles("branding", Array.from(brandingPaths)),
  ]);

  const payload: BackupPayload = {
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    tables,
    auth_users: authUsers,
    storage_selfies,
    storage_branding,
  };

  await writeAudit(admin.profile.user_id, {
    action: "backup.export",
    entity: "system",
    meta: {
      tables: TABLES.length,
      selfies: storage_selfies.length,
      branding: storage_branding.length,
    },
  });

  return { ok: true, data: payload };
}

async function uploadStorageFile(bucket: string, path: string, base64: string, contentType: string) {
  const service = getServiceClient();
  const bytes = Buffer.from(base64, "base64");
  await service.storage.from(bucket).upload(path, bytes, { contentType, upsert: true });
}

export async function importBackupAction(
  payload: BackupPayload,
  options?: { resetFirst?: boolean }
): Promise<ActionResult> {
  const admin = await getAdminOrNull();
  if (!admin) return { ok: false, error: "دسترسی غیرمجاز." };

  if (!payload || payload.version !== BACKUP_VERSION || !payload.tables) {
    return { ok: false, error: "فایل بکاپ نامعتبر است." };
  }

  if (options?.resetFirst) {
    const resetResult = await resetSystemAction("RESET-CONFIRM");
    if (!resetResult.ok) return resetResult;
  }

  const service = getServiceClient();

  const insertOrder = [
    "app_settings",
    "workplaces",
    "work_schedules",
    "profiles",
    "employee_workplaces",
    "employee_schedules",
    "iran_holidays",
    "attendance_sessions",
    "photo_uploads",
    "admin_adjustments",
    "suspicious_events",
    "leave_requests",
    "audit_logs",
  ] as const;

  for (const table of insertOrder) {
    const rows = payload.tables[table];
    if (!rows || !Array.isArray(rows) || rows.length === 0) continue;

    if (table === "app_settings") {
      const { error } = await service.from(table).upsert(rows, { onConflict: "id" });
      if (error) return { ok: false, error: `بازیابی ${table} ناموفق: ${error.message}` };
    } else {
      const { error } = await service.from(table).insert(rows);
      if (error) {
        console.error(`[restore] ${table}`, error.message);
        return { ok: false, error: `بازیابی ${table} ناموفق بود.` };
      }
    }
  }

  for (const file of payload.storage_selfies ?? []) {
    await uploadStorageFile("selfies", file.path, file.base64, "image/jpeg").catch(() => undefined);
  }
  for (const file of payload.storage_branding ?? []) {
    const ext = file.path.split(".").pop()?.toLowerCase();
    const mime =
      ext === "png" ? "image/png" : ext === "svg" ? "image/svg+xml" : ext === "webp" ? "image/webp" : "image/jpeg";
    await uploadStorageFile("branding", file.path, file.base64, mime).catch(() => undefined);
  }

  await writeAudit(admin.profile.user_id, {
    action: "backup.import",
    entity: "system",
    meta: { exported_at: payload.exported_at },
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function resetSystemAction(confirmText: string): Promise<ActionResult> {
  const admin = await getAdminOrNull();
  if (!admin) return { ok: false, error: "دسترسی غیرمجاز." };

  if (confirmText !== "RESET-CONFIRM") {
    return { ok: false, error: "برای تأیید باید عبارت RESET-CONFIRM را وارد کنید." };
  }

  const service = getServiceClient();
  const adminId = admin.profile.user_id;

  const deleteOrder = [
    "leave_requests",
    "suspicious_events",
    "admin_adjustments",
    "photo_uploads",
    "attendance_sessions",
    "employee_schedules",
    "employee_workplaces",
    "iran_holidays",
    "audit_logs",
  ] as const;

  for (const table of deleteOrder) {
    if (table === "employee_workplaces" || table === "employee_schedules") {
      await service.from(table).delete().neq("profile_id", "00000000-0000-0000-0000-000000000000");
    } else if (table === "photo_uploads") {
      await service.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
    } else {
      await service.from(table).delete().gte("id", 0);
    }
  }

  await service.from("profiles").delete().neq("user_id", adminId);
  await service.from("work_schedules").delete().gte("id", 0);
  await service.from("workplaces").delete().gte("id", 0);

  const { data: users } = await service.auth.admin.listUsers({ perPage: 1000 });
  for (const u of users?.users ?? []) {
    if (u.id !== adminId) {
      await service.auth.admin.deleteUser(u.id).catch(() => undefined);
    }
  }

  try {
    const { data: selfieFiles } = await service.storage.from("selfies").list("", { limit: 10000 });
    if (selfieFiles?.length) {
      const paths = selfieFiles.map((f) => f.name);
      await service.storage.from("selfies").remove(paths);
    }
  } catch {
    // bucket may be empty
  }

  await writeAudit(adminId, {
    action: "system.reset",
    entity: "system",
    meta: { note: "full system reset" },
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function syncHolidaysAction(): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const admin = await getAdminOrNull();
  if (!admin) return { ok: false, error: "دسترسی غیرمجاز." };

  const count = await syncIranHolidaysToDb();
  await writeAudit(admin.profile.user_id, {
    action: "holidays.sync",
    entity: "iran_holidays",
    meta: { count },
  });

  revalidatePath("/admin/settings");
  return { ok: true, count };
}
