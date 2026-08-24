"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const credentialsSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(6).max(128),
});

// Naive in-memory throttle (per server instance) — sufficient for ~50 users.
const attempts = new Map<string, { count: number; resetAt: number }>();

function throttled(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count += 1;
  return entry.count > 8;
}

export interface LoginState {
  error?: string;
}

export async function signInAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = credentialsSchema.safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
  });

  if (!parsed.success) {
    return { error: "ایمیل یا گذرواژه نامعتبر است." };
  }

  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (throttled(`${ip}:${parsed.data.email}`)) {
    return { error: "تلاش‌های زیاد؛ لطفاً یک دقیقه بعد دوباره امتحان کنید." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error || !data.user) {
    return { error: "ورود ناموفق بود. ایمیل یا گذرواژه را بررسی کنید." };
  }

  // Resolve role + status before routing
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, employment_status")
    .eq("user_id", data.user.id)
    .maybeSingle<{ role: string; employment_status: string }>();

  if (profileError || !profile) {
    await supabase.auth.signOut();
    return { error: "پروفایل کاربری شما یافت نشد. با مدیر سامانه تماس بگیرید." };
  }
  if (profile.employment_status !== "active") {
    await supabase.auth.signOut();
    return { error: "حساب کاربری شما غیرفعال است." };
  }

  redirect(profile.role === "admin" ? "/admin" : "/app");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

const passwordSchema = z.object({
  current: z.string().min(1).max(128),
  next: z.string().min(8).max(128),
});

export async function changePasswordAction(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "گذرواژه جدید باید حداقل ۸ کاراکتر باشد." };
  }

  const supabase = await createClient();

  // Verify current password by re-authenticating
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, error: "ابتدا وارد شوید." };

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.current,
  });
  if (verifyError) {
    return { ok: false, error: "گذرواژه فعلی نادرست است." };
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: parsed.data.next });
  if (updateError) {
    return { ok: false, error: "تغییر گذرواژه ناموفق بود. دوباره تلاش کنید." };
  }
  return { ok: true };
}
