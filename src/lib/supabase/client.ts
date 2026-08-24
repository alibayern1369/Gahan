"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

let cached: ReturnType<typeof createBrowserClient> | null = null;

/** Browser-side Supabase client used for storage uploads with the user's own JWT. */
export function getClient() {
  if (!cached) {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("پیکربندی Supabase در مرورگر در دسترس نیست.");
    }
    cached = createBrowserClient(supabaseUrl, supabaseAnonKey);
  }
  return cached;
}
