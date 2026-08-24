import type { ReactNode } from "react";

export function GlassCard({
  children,
  className = "",
  strong = false,
}: {
  children: ReactNode;
  className?: string;
  strong?: boolean;
}) {
  return (
    <div className={`${strong ? "glass-strong" : "glass"} rounded-3xl ${className}`}>{children}</div>
  );
}

export function SectionTitle({
  title,
  subtitle,
  action,
  icon,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="flex items-center gap-1.5 text-lg font-bold">
          {icon}
          {title}
        </h2>
        {subtitle ? <p className="mt-0.5 text-xs text-secondary">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: "default" | "success" | "warning" | "danger" | "info";
}) {
  const tones: Record<string, string> = {
    default: "text-brand-500 dark:text-brand-400",
    success: "text-mint-500",
    warning: "text-amber-500",
    danger: "text-rose-500",
    info: "text-sky-500",
  };
  return (
    <GlassCard className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-secondary">{label}</span>
        {icon ? <span className={`${tones[tone]} opacity-80`}>{icon}</span> : null}
      </div>
      <div className="mt-2 text-2xl font-extrabold tabular-nums">{value}</div>
      {hint ? <div className="mt-1 text-[11px] text-faint">{hint}</div> : null}
    </GlassCard>
  );
}
