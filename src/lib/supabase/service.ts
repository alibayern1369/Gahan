import "server-only";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertPublicEnv, requireServiceRoleKey, supabaseUrl } from "@/lib/env";

let cached: SupabaseClient | null = null;

/**
 * Privileged client that bypasses RLS.
 * Only for: creating auth users, storage admin operations, cleanup jobs.
 * The caller must verify admin authorization BEFORE using this client.
 */
export function getServiceClient(): SupabaseClient {
  if (!cached) {
    assertPublicEnv();
    cached = createSupabaseClient(supabaseUrl, requireServiceRoleKey(), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return cached;
}
