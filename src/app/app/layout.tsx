import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { EmployeeTabs } from "@/components/employee-tabs";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireAuth();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="glass sticky top-0 z-40 rounded-none border-x-0 border-t-0 px-4 pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-3">
        <div className="mx-auto flex w-full max-w-lg items-center justify-between">
          <Link href="/app" aria-label={`برنامه گاهان — ${profile.first_name}`}>
            <BrandMark size="sm" />
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-5">{children}</main>

      <EmployeeTabs />
    </div>
  );
}
