import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { getSettings } from "@/lib/settings-server";

export const metadata: Metadata = {
  title: "ورود به حساب",
};

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const settings = await getSettings();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-10 safe-top safe-bottom">
      <div className="absolute top-4 left-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandMark size="lg" />
          <p className="mt-3 text-xs font-medium text-secondary">{settings.tagline}</p>
          <p className="mt-1 text-[11px] text-faint">{settings.organization_name}</p>
        </div>

        <Suspense>
          <LoginForm />
        </Suspense>

        <p className="mt-8 text-center text-[11px] leading-6 text-faint">
          سامانه گاهان؛ ثبت حضور هوشمند با موقعیت مکانی و تأیید چهره.
          <br />
          برای ورود از اطلاعات حساب کاربری خود استفاده کنید.
        </p>
      </div>
    </main>
  );
}
