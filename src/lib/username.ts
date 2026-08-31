const INTERNAL_DOMAIN = "users.local";

/** Normalize username for storage and lookup. */
export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

/** Map a display username to the Supabase auth email identifier. */
export function toAuthEmail(username: string): string {
  const normalized = normalizeUsername(username);
  if (normalized.includes("@")) return normalized;
  return `${normalized}@${INTERNAL_DOMAIN}`;
}

/** Show the login username stored in profiles.email. */
export function displayUsername(stored: string | null | undefined): string {
  if (!stored) return "";
  const suffix = `@${INTERNAL_DOMAIN}`;
  if (stored.endsWith(suffix)) return stored.slice(0, -suffix.length);
  return stored;
}
