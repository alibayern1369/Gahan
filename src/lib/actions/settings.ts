"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminOrNull } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { runSelfieCleanup } from "@/lib/cleanup";
import { getServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

/* ============================================================
   Settings
   ============================================================ */

const settingsSchema = z.object({
  organization_name: z.string().trim().min(1).max(120),
  application_name: z.string().trim().min(1).max(60),
  tagline: z.string().trim().min(1).max(160),
  timezone: z.string().trim().min(1).max(60),
  default_radius_m: z.number().int().min(10).max(10000),
  max_gps_accuracy_m: z.number().int().min(10).max(5000),
  selfie_retention_days: z.number().int().min(7).max(365),
  workweek_days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  default_work_hours: z.number().min(1).max(16),
  grace_minutes: z.number().int().min(0).max(240),
});

export async function updateSettingsAction(input: unknown): Promise<ActionResult> {
  const adminCtx = await getAdminOrNull();
  if (!adminCtx) return { ok: false, error: "Ø¯Ø³ØªØ±Ø³ÛŒ ØºÛŒØ±Ù…Ø¬Ø§Ø²." };

  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Ù…Ù‚Ø§Ø¯ÛŒØ± ØªÙ†Ø¸ÛŒÙ…Ø§Øª Ù…Ø¹ØªØ¨Ø± Ù†ÛŒØ³Øª." };

  // basic timezone sanity via Intl
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: parsed.data.timezone });
  } catch {
    return { ok: false, error: "Ù…Ù†Ø·Ù‚Ù‡ Ø²Ù…Ø§Ù†ÛŒ Ù†Ø§Ù…Ø¹ØªØ¨Ø± Ø§Ø³Øª. Ù…Ø«Ø§Ù„ ØµØ­ÛŒØ­: Asia/Tehran" };
  }

  const supabase = await createClient();
  const { data: before } = await supabase.from("app_settings").select("*").eq("id", true).maybeSingle();

  const { error } = await supabase
    .from("app_settings")
    .update(parsed.data)
    .eq("id", true);

  if (error) {
    console.error("[updateSettings]", error.message);
    return { ok: false, error: "Ø°Ø®ÛŒØ±Ù‡ ØªÙ†Ø¸ÛŒÙ…Ø§Øª Ù†Ø§Ù…ÙˆÙÙ‚ Ø¨ÙˆØ¯." };
  }

  await writeAudit(adminCtx.profile.user_id, {
    action: "settings.update",
    entity: "app_settings",
    entityId: "singleton",
    oldValue: before as Record<string, unknown> | null,
    newValue: parsed.data,
  });

  revalidatePath("/admin/settings");
  revalidatePath("/app");
  return { ok: true };
}

export async function triggerCleanupAction(): Promise<{ ok: boolean; removed?: number; error?: string }> {
  const adminCtx = await getAdminOrNull();
  if (!adminCtx) return { ok: false, error: "Ø¯Ø³ØªØ±Ø³ÛŒ ØºÛŒØ±Ù…Ø¬Ø§Ø²." };

  const result = await runSelfieCleanup();
  if (!result.ok) return { ok: false, error: "Ù¾Ø§Ú©â€ŒØ³Ø§Ø²ÛŒ Ù†Ø§Ù…ÙˆÙÙ‚ Ø¨ÙˆØ¯. Ù„Ø§Ú¯ Ø³Ø±ÙˆØ± Ø±Ø§ Ø¨Ø±Ø±Ø³ÛŒ Ú©Ù†ÛŒØ¯." };

  await writeAudit(adminCtx.profile.user_id, {
    action: "cleanup.manual_run",
    entity: "storage",
    meta: result as unknown as Record<string, unknown>,
  });
  return { ok: true, removed: (result.removed_orphans ?? 0) + (result.removed_expired ?? 0) };
}

/* ============================================================
   Branding assets
   ============================================================ */

const BRANDING_KINDS = ["logo_light", "logo_dark", "favicon", "pwa_icon"] as const;
type BrandingKind = (typeof BRANDING_KINDS)[number];

const KIND_META: Record<BrandingKind, { folder: string; column: string; maxKB: number; allowSvg: boolean }> = {
  logo_light: { folder: "branding/logos", column: "logo_light_path", maxKB: 512, allowSvg: true },
  logo_dark: { folder: "branding/logos", column: "logo_dark_path", maxKB: 512, allowSvg: true },
  favicon: { folder: "branding/favicons", column: "favicon_path", maxKB: 256, allowSvg: true },
  pwa_icon: { folder: "branding/icons", column: "pwa_icon_path", maxKB: 512, allowSvg: false },
};

const MIME_BY_EXT: Record<string, string[]> = {
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  webp: ["image/webp"],
  svg: ["image/svg+xml", "text/svg", "text/plain"],
};

/** Minimal SVG sanitizer: strips scripts/handlers/foreign URLs before storage. */
function sanitizeSvg(svg: string): string {
  let out = svg;
  out = out.replace(/<script[\s\S]*?<\/script>/gi, "");
  out = out.replace(/<script[^>]*\/?>/gi, "");
  out = out.replace(/\son\w+\s*=\s*"[^"]*"/gi, "");
  out = out.replace(/\son\w+\s*=\s*'[^']*'/gi, "");
  out = out.replace(/\son\w+\s*=\s*[^\s>]+/gi, "");
  out = out.replace(/javascript:/gi, "");
  out = out.replace(/<!DOCTYPE[^>]*>/gi, "");
  out = out.replace(/<!--[\s\S]*?-->/g, "");
  if (!/<svg[\s\S]*<\/svg>/i.test(out)) throw new Error("not-svg");
  return out;
}

function extFromName(name: string): string | null {
  const m = /\.([a-z0-9]+)$/i.exec(name.trim());
  return m ? m[1].toLowerCase() : null;
}

export async function uploadBrandingAction(
  kind: string,
  formData: FormData
): Promise<ActionResult> {
  const adminCtx = await getAdminOrNull();
  if (!adminCtx) return { ok: false, error: "Ø¯Ø³ØªØ±Ø³ÛŒ ØºÛŒØ±Ù…Ø¬Ø§Ø²." };

  if (!BRANDING_KINDS.includes(kind as BrandingKind)) {
    return { ok: false, error: "Ù†ÙˆØ¹ ÙØ§ÛŒÙ„ Ù†Ø§Ù…Ø¹ØªØ¨Ø± Ø§Ø³Øª." };
  }
  const meta = KIND_META[kind as BrandingKind];

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "ÙØ§ÛŒÙ„ÛŒ Ø§Ù†ØªØ®Ø§Ø¨ Ù†Ø´Ø¯Ù‡ Ø§Ø³Øª." };
  }

  const ext = extFromName(file.name);
  if (!ext || !(ext in MIME_BY_EXT)) {
    return { ok: false, error: "ÙØ±Ù…Øª Ù…Ø¬Ø§Ø² Ù†ÛŒØ³Øª. Ø§Ø² PNGØŒ JPGØŒ WebP ÛŒØ§ SVG Ø§Ø³ØªÙØ§Ø¯Ù‡ Ú©Ù†ÛŒØ¯." };
  }
  if (ext === "svg" && !meta.allowSvg) {
    return { ok: false, error: "Ø¨Ø±Ø§ÛŒ Ø¢ÛŒÚ©ÙˆÙ† PWA Ø­ØªÙ…Ø§Ù‹ PNG (Ø­Ø¯Ø§Ù‚Ù„ ÛµÛ±Û²Ã—ÛµÛ±Û²) Ø¨Ø§Ø±Ú¯Ø°Ø§Ø±ÛŒ Ú©Ù†ÛŒØ¯." };
  }

  const mimeOk = MIME_BY_EXT[ext].includes(file.type) || file.type === "";
  if (!mimeOk) {
    return { ok: false, error: `Ù†ÙˆØ¹ ÙØ§ÛŒÙ„ (${file.type}) Ø¨Ø§ Ù¾Ø³ÙˆÙ†Ø¯ ${ext} Ø³Ø§Ø²Ú¯Ø§Ø± Ù†ÛŒØ³Øª.` };
  }
  if (file.size > meta.maxKB * 1024) {
    return { ok: false, error: `Ø­Ø¬Ù… ÙØ§ÛŒÙ„ Ø¨ÛŒØ´ Ø§Ø² Ø­Ø¯ Ù…Ø¬Ø§Ø² Ø§Ø³Øª (Ø­Ø¯Ø§Ú©Ø«Ø± ${meta.maxKB} Ú©ÛŒÙ„ÙˆØ¨Ø§ÛŒØª).` };
  }

  let bytes = new Uint8Array(await file.arrayBuffer());
  if (ext === "svg") {
    try {
      const text = new TextDecoder().decode(bytes);
      bytes = new TextEncoder().encode(sanitizeSvg(text));
    } catch {
      return { ok: false, error: "ÙØ§ÛŒÙ„ SVG Ù…Ø¹ØªØ¨Ø± ÛŒØ§ Ø§Ù…Ù† Ù†ÛŒØ³Øª." };
    }
  }

  const service = getServiceClient();
  const path = `${meta.folder}/${kind}-${Date.now()}.${ext}`;

  const { error: upError } = await service.storage
    .from("branding")
    .upload(path, bytes, { contentType: ext === "svg" ? "image/svg+xml" : file.type || MIME_BY_EXT[ext][0], upsert: false });

  if (upError) {
    console.error("[uploadBranding]", upError.message);
    return { ok: false, error: "Ø¨Ø§Ø±Ú¯Ø°Ø§Ø±ÛŒ ÙØ§ÛŒÙ„ Ù†Ø§Ù…ÙˆÙÙ‚ Ø¨ÙˆØ¯." };
  }

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("app_settings")
    .select(`${meta.column}, updated_at`)
    .eq("id", true)
    .maybeSingle<Record<string, string | null>>();

  const oldPath = current?.[meta.column] ?? null;

  const { error: setErr } = await supabase
    .from("app_settings")
    .update({ [meta.column]: path })
    .eq("id", true);
  if (setErr) {
    await service.storage.from("branding").remove([path]);
    return { ok: false, error: "Ø¨Ù‡â€ŒØ±ÙˆØ²Ø±Ø³Ø§Ù†ÛŒ ØªÙ†Ø¸ÛŒÙ…Ø§Øª Ù†Ø§Ù…ÙˆÙÙ‚ Ø¨ÙˆØ¯." };
  }

  if (oldPath && oldPath !== path) {
    await service.storage.from("branding").remove([oldPath]).catch(() => undefined);
  }

  await writeAudit(adminCtx.profile.user_id, {
    action: "branding.upload",
    entity: "app_settings",
    entityId: "singleton",
    newValue: { kind, path },
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeBrandingAction(kind: string): Promise<ActionResult> {
  const adminCtx = await getAdminOrNull();
  if (!adminCtx) return { ok: false, error: "Ø¯Ø³ØªØ±Ø³ÛŒ ØºÛŒØ±Ù…Ø¬Ø§Ø²." };
  if (!BRANDING_KINDS.includes(kind as BrandingKind)) return { ok: false, error: "Ù†ÙˆØ¹ Ù†Ø§Ù…Ø¹ØªØ¨Ø±." };

  const meta = KIND_META[kind as BrandingKind];
  const supabase = await createClient();
  const { data: current } = await supabase
    .from("app_settings")
    .select(meta.column)
    .eq("id", true)
    .maybeSingle<Record<string, string | null>>();

  const oldPath = current?.[meta.column] ?? null;

  const { error } = await supabase.from("app_settings").update({ [meta.column]: null }).eq("id", true);
  if (error) return { ok: false, error: "Ø­Ø°Ù Ù†Ø§Ù…ÙˆÙÙ‚ Ø¨ÙˆØ¯." };

  if (oldPath) {
    const service = getServiceClient();
    await service.storage.from("branding").remove([oldPath]).catch(() => undefined);
  }

  await writeAudit(adminCtx.profile.user_id, {
    action: "branding.remove",
    entity: "app_settings",
    entityId: "singleton",
    oldValue: { kind, path: oldPath },
  });

  revalidatePath("/", "layout");
  return { ok: true };
}
