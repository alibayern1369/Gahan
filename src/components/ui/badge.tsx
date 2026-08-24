import type { LucideIcon } from "lucide-react";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "brand";

const tones: Record<Tone, string> = {
  neutral:
    "bg-slate-500/10 text-slate-600 dark:text-slate-300 ring-slate-500/20",
  success:
    "bg-mint-500/12 text-mint-600 dark:text-mint-400 ring-mint-500/25",
  warning:
    "bg-amber-500/12 text-amber-600 dark:text-amber-400 ring-amber-500/25",
  danger:
    "bg-rose-500/12 text-rose-600 dark:text-rose-400 ring-rose-500/25",
  info: "bg-sky-500/12 text-sky-600 dark:text-sky-400 ring-sky-500/25",
  brand: "bg-brand-500/12 text-brand-600 dark:text-brand-300 ring-brand-500/25",
};

export function Badge({
  children,
  tone = "neutral",
  icon: Icon,
  className = "",
}: {
  children: React.ReactNode;
  tone?: Tone;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${tones[tone]} ${className}`}
    >
      {Icon ? <Icon className="size-3.5" aria-hidden /> : null}
      {children}
    </span>
  );
}
