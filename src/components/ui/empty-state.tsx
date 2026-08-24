import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 flex size-16 items-center justify-center rounded-3xl bg-brand-500/10 text-brand-500">
        <Icon className="size-7" aria-hidden />
      </div>
      <h3 className="text-sm font-bold">{title}</h3>
      {description ? <p className="mt-1.5 max-w-xs text-xs leading-5 text-secondary">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
