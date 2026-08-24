"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, MoonStar, Sun } from "lucide-react";

const options = [
  { key: "light", label: "روشن", Icon: Sun },
  { key: "dark", label: "تاریک", Icon: MoonStar },
  { key: "system", label: "سیستم", Icon: Monitor },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div
      role="radiogroup"
      aria-label="انتخاب حالت نمایش"
      className="glass inline-flex items-center gap-0.5 rounded-2xl p-1"
    >
      {options.map(({ key, label, Icon }) => {
        const active = mounted && theme === key;
        return (
          <button
            key={key}
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(key)}
            className={`flex size-8 items-center justify-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring-color)] ${
              active ? "bg-brand-500/15 text-brand-500" : "text-faint hover:text-secondary"
            }`}
          >
            <Icon className="size-4" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
