"use client";

import { FieldLabel } from "@/components/ui/input";

export function WorkplaceMultiSelect({
  workplaces,
  selectedIds,
  onChange,
}: {
  workplaces: Array<{ id: number; name: string }>;
  selectedIds: number[];
  onChange: (ids: number[]) => void;
}) {
  if (workplaces.length === 0) {
    return (
      <p className="text-xs text-faint">
        هنوز محل کاری تعریف نشده. ابتدا از بخش «موقعیت‌های کاری» محل‌ها را بسازید.
      </p>
    );
  }

  function toggle(id: number) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  return (
    <div className="space-y-2 rounded-2xl bg-black/[0.03] p-3.5 dark:bg-white/[0.05]">
      <FieldLabel>محل‌های مجاز حضور و غیاب</FieldLabel>
      <p className="mb-2 text-[11px] leading-5 text-faint">
        کارمند فقط در محدودهٔ محل‌های انتخاب‌شده می‌تواند ورود/خروج ثبت کند.
      </p>
      <ul className="space-y-2">
        {workplaces.map((w) => (
          <li key={w.id}>
            <label className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 text-xs font-semibold hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
              <input
                type="checkbox"
                checked={selectedIds.includes(w.id)}
                onChange={() => toggle(w.id)}
                className="size-4 accent-[color:var(--color-brand-500)]"
              />
              {w.name}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
