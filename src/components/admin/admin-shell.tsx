"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  CalendarClock,
  ClipboardList,
  FileBarChart,
  LayoutDashboard,
  Menu,
  Settings,
  ShieldAlert,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";

const NAV = [
  { href: "/admin", label: "داشبورد", Icon: LayoutDashboard },
  { href: "/admin/today", label: "حضور امروز", Icon: ClipboardList },
  { href: "/admin/employees", label: "کارمندان", Icon: Users },
  { href: "/admin/reports", label: "گزارش‌ها", Icon: FileBarChart },
  { href: "/admin/workplaces", label: "موقعیت‌های کاری", Icon: Building2 },
  { href: "/admin/schedules", label: "برنامه کاری", Icon: CalendarClock },
  { href: "/admin/suspicious", label: "رویدادهای مشکوک", Icon: ShieldAlert },
  { href: "/admin/settings", label: "تنظیمات", Icon: Settings },
];

export function AdminShell({
  children,
  orgName,
  brand,
}: {
  children: React.ReactNode;
  orgName: string;
  brand: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/admin" ? pathname === href : pathname.startsWith(href);

  const nav = (
    <nav aria-label="ناوبری مدیریت" className="flex flex-col gap-1">
      {NAV.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          onClick={() => setOpen(false)}
          aria-current={isActive(href) ? "page" : undefined}
          className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring-color)] ${
            isActive(href)
              ? "bg-brand-500/15 text-brand-600 dark:text-brand-300"
              : "text-secondary hover:bg-black/5 dark:hover:bg-white/5 hover:text-[color:var(--text-primary)]"
          }`}
        >
          <Icon className="size-4.5 shrink-0" aria-hidden />
          {label}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="min-h-dvh lg:flex">
      {/* ---------- desktop sidebar ---------- */}
      <aside className="glass sticky top-0 hidden h-dvh w-64 shrink-0 flex-col rounded-none border-y-0 border-l-0 p-5 lg:flex">
        <div className="mb-8 px-1">
          {brand}
          <p className="mt-2 text-[10px] text-faint">{orgName}</p>
        </div>
        <div className="flex-1 overflow-y-auto">{nav}</div>
        <div className="space-y-3 border-t border-[color:var(--border-line)] pt-4">
          <ThemeToggle />
          <SignOutButton label="خروج" variant="ghost" full />
        </div>
      </aside>

      {/* ---------- mobile top bar ---------- */}
      <header className="glass sticky top-0 z-50 rounded-none border-x-0 border-t-0 px-4 pt-[calc(env(safe-area-inset-top,0px)+10px)] pb-3 lg:hidden">
        <div className="flex items-center justify-between">
          {brand}
          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label="منوی مدیریت"
            className="glass rounded-xl p-2.5"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
        {open ? (
          <div className="pop-in mt-4 space-y-4">
            {nav}
            <div className="flex items-center justify-between gap-3 border-t border-[color:var(--border-line)] pt-4">
              <ThemeToggle />
              <SignOutButton label="خروج" variant="ghost" />
            </div>
          </div>
        ) : null}
      </header>

      {/* ---------- content ---------- */}
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 safe-top">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}

export function AdminPageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-3">
        <UserCog className="hidden size-6 text-brand-500 sm:block" aria-hidden />
        <div>
          <h1 className="text-xl font-extrabold sm:text-2xl">{title}</h1>
          {subtitle ? <p className="mt-1 text-xs text-secondary">{subtitle}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}
