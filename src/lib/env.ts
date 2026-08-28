const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Read at request time on the server (avoids stale build-time empty values). */
export function readSupabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
}

/** Read at request time on the server (avoids stale build-time empty values). */
export function readSupabaseAnonKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
}

/** Inlined for browser bundles at build time. */
export const supabaseUrl = url ?? "";
export const supabaseAnonKey = anon ?? "";

export function hasPublicEnv(): boolean {
  return Boolean(readSupabaseUrl() && readSupabaseAnonKey());
}

export function assertPublicEnv(): void {
  if (!hasPublicEnv()) {
    throw new Error(
      "متغیرهای NEXT_PUBLIC_SUPABASE_URL و NEXT_PUBLIC_SUPABASE_ANON_KEY تنظیم نشده‌اند. فایل .env.local را بر اساس .env.example بسازید."
    );
  }
}

/** Server-only privileged key. Never import this module from client code. */
export function requireServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) {
    throw new Error(
      "متغیر SUPABASE_SERVICE_ROLE_KEY تنظیم نشده است. این متغیر فقط سمت سرور استفاده می‌شود."
    );
  }
  return key;
}

export function hasServiceRoleKey(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

/** Helps diagnose misconfigured Vercel env without exposing secrets. */
export function envDiagnostics() {
  const anon = readSupabaseAnonKey();
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  return {
    hasUrl: Boolean(readSupabaseUrl()),
    hasAnon: Boolean(anon),
    hasService: Boolean(service),
    anonKind: anon.startsWith("eyJ") ? "jwt" : anon.startsWith("sb_") ? "sb_key" : anon ? "unknown" : "missing",
    serviceKind: service.startsWith("eyJ") ? "jwt" : service.startsWith("sb_") ? "sb_key" : service ? "unknown" : "missing",
  };
}
