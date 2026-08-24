import "server-only";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export interface AuthContext {
  user: User;
  profile: Profile;
}

/** Resolve the current authenticated profile, or null. Identity comes from the server session. */
export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle<Profile>();

  if (!profile) return null;
  return { user, profile };
}

export async function requireAuth(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (ctx.profile.employment_status !== "active") {
    await forceSignOut();
    redirect("/login?error=inactive");
  }
  return ctx;
}

export async function requireAdmin(): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (ctx.profile.role !== "admin") redirect("/app");
  return ctx;
}

export async function forceSignOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
}

/** For server actions / route handlers: returns null instead of redirecting. */
export async function getAdminOrNull(): Promise<AuthContext | null> {
  const ctx = await getAuthContext();
  if (!ctx || ctx.profile.role !== "admin" || ctx.profile.employment_status !== "active") {
    return null;
  }
  return ctx;
}
