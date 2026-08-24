"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { History, Home, UserRound } from "lucide-react";

const TABS = [
  { href: "/app", label: "خانه", Icon: Home, exact: true },
  { href: "/app/history", label: "سوابق", Icon: History },
  { href: "/app/profile", label: "حساب", Icon: UserRound },
] as const;

export function EmployeeTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="ناوبری اصلی"
      className="glass sticky bottom-0 z-40 rounded-none border-x-0 border-b-0 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+8px)] pt-2"
    >
      <div className="mx-auto flex w-full max-w-lg items-stretch justify-around gap-1">
        {TABS.map(({ href, label, Icon, ...rest }) => {
          const active = "exact" in rest && rest.exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              prefetch
              className={`flex min-w-20 flex-col items-center gap-1 rounded-2xl px-4 py-2 text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring-color)] ${
                active ? "text-brand-500" : "text-secondary hover:text-brand-500"
              }`}
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
