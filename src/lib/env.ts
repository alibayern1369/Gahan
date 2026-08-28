const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Public (browser-safe) Supabase configuration. */
export const supabaseUrl = url ?? "";
export const supabaseAnonKey = anon ?? "";

export function hasPublicEnv(): boolean {
  return Boolean(url?.trim() && anon?.trim());
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
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "متغیر SUPABASE_SERVICE_ROLE_KEY تنظیم نشده است. این متغیر فقط سمت سرور استفاده می‌شود."
    );
  }
  return key;
}
