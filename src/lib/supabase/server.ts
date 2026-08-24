import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { assertPublicEnv, supabaseAnonKey, supabaseUrl } from "@/lib/env";

/**
 * Supabase client bound to the current user's session cookies.
 * Respects RLS — the identity of the caller is resolved server-side.
 */
export async function createClient() {
  assertPublicEnv();
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component render pass; middleware refreshes sessions.
        }
      },
    },
  });
}
