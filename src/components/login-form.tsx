"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LogIn, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, FieldLabel } from "@/components/ui/input";
import { getClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "")
      .trim()
      .toLowerCase();
    const password = String(formData.get("password") ?? "");

    if (!email || password.length < 6) {
      setError("ایمیل یا گذرواژه نامعتبر است.");
      setPending(false);
      return;
    }

    try {
      const supabase = getClient();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });

      if (signInError || !data.user) {
        setError("ورود ناموفق بود. ایمیل یا رمز عبور را بررسی کنید.");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role, employment_status")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (profileError || !profile) {
        await supabase.auth.signOut();
        setError("پروفایل کاربری شما یافت نشد. با مدیر سامانه تماس بگیرید.");
        return;
      }

      if (profile.employment_status !== "active") {
        await supabase.auth.signOut();
        setError("حساب کاربری شما غیرفعال است.");
        return;
      }

      router.refresh();
      router.push(profile.role === "admin" ? "/admin" : "/app");
    } catch {
      setError(
        "اتصال به Supabase برقرار نشد. در Vercel متغیرهای NEXT_PUBLIC_* را بررسی کنید و Deploy را با Clear Cache انجام دهید."
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="glass-strong rounded-3xl p-6 space-y-4">
      <div>
        <FieldLabel htmlFor="email">ایمیل سازمانی</FieldLabel>
        <div className="relative">
          <Mail className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            dir="ltr"
            required
            placeholder="you@example.com"
            className="pr-11 text-left"
          />
        </div>
      </div>

      <div>
        <FieldLabel htmlFor="password">رمز عبور</FieldLabel>
        <div className="relative">
          <KeyRound className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            minLength={6}
            placeholder="••••••••"
            className="pr-11"
          />
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl bg-rose-500/10 px-3.5 py-2.5 text-xs font-medium text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" loading={pending} className="w-full">
        {!pending && <LogIn className="size-4" aria-hidden />}
        ورود به گاهان
      </Button>
    </form>
  );
}
