import "server-only";
import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AppSettings } from "@/lib/types";

export const DEFAULT_SETTINGS: AppSettings = {
  id: true,
  organization_name: "سازمان من",
  application_name: "گاهان",
  tagline: "سامانه هوشمند حضور و غیاب",
  timezone: "Asia/Tehran",
  default_radius_m: 150,
  max_gps_accuracy_m: 100,
  selfie_retention_days: 30,
  workweek_days: [0, 1, 2, 3, 4],
  default_work_hours: 8,
  grace_minutes: 10,
  logo_light_path: null,
  logo_dark_path: null,
  favicon_path: null,
  pwa_icon_path: null,
  theme_color: "#5d47e4",
  updated_at: new Date(0).toISOString(),
};

async function fetchSettings(): Promise<AppSettings> {
  try {
    const { getServiceClient } = await import("@/lib/supabase/service");
    const { data } = await getServiceClient()
      .from("app_settings")
      .select("*")
      .eq("id", true)
      .maybeSingle<AppSettings>();
    if (data) return data;
  } catch {
    // service key missing or unreachable — try session client below
  }

  try {
    const supabase = await createClient();
    const { data } = await supabase.from("app_settings").select("*").eq("id", true).maybeSingle<AppSettings>();
    return data ?? DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

const getCachedSettings = unstable_cache(fetchSettings, ["app-settings"], {
  revalidate: 60,
  tags: ["app-settings"],
});

/** Fetch singleton app settings; falls back to safe defaults on any failure. */
export async function getSettings(): Promise<AppSettings> {
  return getCachedSettings();
}

/** Public URL for an object inside the public `branding` bucket. */
export function brandingPublicUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/branding/${path}`;
}
