import { envDiagnostics, readSupabaseAnonKey, readSupabaseUrl, requireServiceRoleKey } from "@/lib/env";
import { DEFAULT_SETTINGS } from "@/lib/settings-server";

export const dynamic = "force-dynamic";

function projectRefFromUrl(rawUrl: string): string | null {
  try {
    const host = new URL(rawUrl).hostname;
    const match = host.match(/^([a-z0-9-]+)\.supabase\.co$/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function projectRefFromJwt(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as {
      ref?: string;
    };
    return payload.ref ?? null;
  } catch {
    return null;
  }
}

async function queryStatus(path: string, apiKey: string): Promise<{ status: number; body: string }> {
  const base = readSupabaseUrl().replace(/\/+$/, "");
  const res = await fetch(`${base}${path}`, {
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
    },
    cache: "no-store",
  });
  return { status: res.status, body: (await res.text()).slice(0, 120) };
}

export async function GET() {
  const diag = envDiagnostics();
  const url = readSupabaseUrl();
  const urlRef = projectRefFromUrl(url);
  const anonRef = projectRefFromJwt(readSupabaseAnonKey());
  const serviceRef = diag.hasService
    ? projectRefFromJwt(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "")
    : null;

  let organizationName: string | null = null;
  let settingsError: string | null = null;
  let profilesStatus: number | null = null;
  let settingsStatus: number | null = null;

  const refsMatch = Boolean(urlRef && anonRef && serviceRef && urlRef === anonRef && urlRef === serviceRef);

  if (diag.hasUrl && diag.hasService && diag.serviceKind === "jwt") {
    try {
      const serviceKey = requireServiceRoleKey();
      const settings = await queryStatus(
        "/rest/v1/app_settings?id=eq.true&select=organization_name",
        serviceKey
      );
      settingsStatus = settings.status;

      const profiles = await queryStatus("/rest/v1/profiles?select=user_id&limit=1", serviceKey);
      profilesStatus = profiles.status;

      if (settings.status === 200) {
        const rows = JSON.parse(settings.body) as Array<{ organization_name: string }>;
        organizationName = rows[0]?.organization_name ?? null;
      } else {
        settingsError = `app_settings HTTP ${settings.status}`;
      }
    } catch (error) {
      settingsError = error instanceof Error ? error.message : "service query error";
    }
  } else {
    settingsError = "env keys missing or not JWT format";
  }

  const ok =
    refsMatch &&
    settingsStatus === 200 &&
    profilesStatus === 200 &&
    organizationName !== null &&
    organizationName !== DEFAULT_SETTINGS.organization_name;

  let hint = "Looks good";
  if (!refsMatch) {
    hint = "URL and JWT keys are from different Supabase projects. Fix NEXT_PUBLIC_SUPABASE_URL or keys.";
  } else if (settingsStatus === 404 || profilesStatus === 404) {
    hint = "Tables missing — run supabase/migrations 0001..0006 in Supabase SQL Editor.";
  } else if (organizationName === null && settingsStatus === 200) {
    hint = "Run migration 0006_public_settings_read.sql or seed app_settings row.";
  } else if (diag.anonKind === "sb_key" || diag.serviceKind === "sb_key") {
    hint = "Use JWT keys (eyJ...) from Supabase, not sb_publishable/sb_secret.";
  }

  return Response.json({
    ok,
    ...diag,
    urlHost: urlRef ? `${urlRef}.supabase.co` : null,
    anonProjectRef: anonRef,
    serviceProjectRef: serviceRef,
    refsMatch,
    profilesStatus,
    settingsStatus,
    organizationName,
    settingsError,
    hint,
  });
}
