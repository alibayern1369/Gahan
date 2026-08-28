import { envDiagnostics, readSupabaseAnonKey, readSupabaseUrl, requireServiceRoleKey } from "@/lib/env";
import { DEFAULT_SETTINGS } from "@/lib/settings-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const diag = envDiagnostics();
  let organizationName: string | null = null;
  let settingsError: string | null = null;

  if (diag.hasUrl && diag.hasService && diag.serviceKind === "jwt") {
    try {
      const res = await fetch(
        `${readSupabaseUrl()}/rest/v1/app_settings?id=eq.true&select=organization_name`,
        {
          headers: {
            apikey: requireServiceRoleKey(),
            Authorization: `Bearer ${requireServiceRoleKey()}`,
          },
          cache: "no-store",
        }
      );
      if (!res.ok) {
        settingsError = `service query failed: ${res.status}`;
      } else {
        const rows = (await res.json()) as Array<{ organization_name: string }>;
        organizationName = rows[0]?.organization_name ?? null;
      }
    } catch (error) {
      settingsError = error instanceof Error ? error.message : "service query error";
    }
  } else if (diag.hasUrl && diag.hasAnon && diag.anonKind === "jwt") {
    try {
      const res = await fetch(
        `${readSupabaseUrl()}/rest/v1/app_settings?id=eq.true&select=organization_name`,
        {
          headers: {
            apikey: readSupabaseAnonKey(),
            Authorization: `Bearer ${readSupabaseAnonKey()}`,
          },
          cache: "no-store",
        }
      );
      if (!res.ok) {
        settingsError = `anon query failed: ${res.status}`;
      } else {
        const rows = (await res.json()) as Array<{ organization_name: string }>;
        organizationName = rows[0]?.organization_name ?? null;
      }
    } catch (error) {
      settingsError = error instanceof Error ? error.message : "anon query error";
    }
  } else {
    settingsError = "env keys missing or not JWT format";
  }

  const ok =
    diag.hasUrl &&
    diag.hasAnon &&
    diag.hasService &&
    diag.anonKind === "jwt" &&
    diag.serviceKind === "jwt" &&
    organizationName !== null &&
    organizationName !== DEFAULT_SETTINGS.organization_name;

  return Response.json({
    ok,
    ...diag,
    organizationName,
    settingsError,
    hint:
      diag.anonKind === "sb_key" || diag.serviceKind === "sb_key"
        ? "Use JWT keys (eyJ...) from Supabase API settings, not sb_publishable/sb_secret."
        : !diag.hasUrl || !diag.hasAnon || !diag.hasService
          ? "Add all 4 env vars in Vercel, then Redeploy with Clear Build Cache."
          : organizationName === null
            ? "DB reachable but settings row missing or blocked by RLS."
            : "Looks good",
  });
}
