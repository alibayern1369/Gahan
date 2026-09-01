"use client";

import { useMemo } from "react";
import {
  JALALI_MONTHS,
  type JalaliDate,
  jalaliMonthLength,
  jalaliYmdToIso,
} from "@/lib/jalali";
import { faNum } from "@/lib/format";
import { FieldLabel } from "@/components/ui/input";

export function JalaliDateField({
  id,
  label,
  value,
  onChange,
}: {
  id?: string;
  label: string;
  value: JalaliDate;
  onChange: (v: JalaliDate) => void;
}) {
  const maxDay = jalaliMonthLength(value.jy, value.jm);
  const safeDay = Math.min(value.jd, maxDay);

  const preview = useMemo(() => {
    try {
      return `${faNum(safeDay)} ${JALALI_MONTHS[value.jm - 1]} ${faNum(value.jy)}`;
    } catch {
      return "";
    }
  }, [safeDay, value.jm, value.jy]);

  const set = (patch: Partial<JalaliDate>) => {
    const next = { ...value, ...patch };
    if (patch.jm !== undefined || patch.jy !== undefined) {
      const max = jalaliMonthLength(next.jy, next.jm);
      next.jd = Math.min(next.jd, max);
    }
    onChange(next);
  };

  return (
    <div className="min-w-0">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div
        className="glass-input mt-1.5 rounded-2xl p-3"
        role="group"
        aria-labelledby={id ? `${id}-label` : undefined}
      >
        <div className="grid grid-cols-3 gap-2">
          <label className="min-w-0">
            <span className="mb-1 block text-center text-[10px] text-faint">سال</span>
            <input
              id={id}
              type="number"
              dir="ltr"
              inputMode="numeric"
              min={1300}
              max={1500}
              value={value.jy}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isNaN(n)) set({ jy: Math.min(1500, Math.max(1300, Math.trunc(n))) });
              }}
              className="glass-input w-full min-w-0 rounded-xl px-1 py-2.5 text-center text-xs tabular-nums"
              aria-label="سال"
            />
          </label>
          <label className="min-w-0 col-span-1">
            <span className="mb-1 block text-center text-[10px] text-faint">ماه</span>
            <select
              value={value.jm}
              onChange={(e) => set({ jm: Number(e.target.value) })}
              className="glass-input w-full min-w-0 appearance-none rounded-xl px-1 py-2.5 text-center text-xs"
              aria-label="ماه"
            >
              {JALALI_MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0">
            <span className="mb-1 block text-center text-[10px] text-faint">روز</span>
            <input
              type="number"
              dir="ltr"
              inputMode="numeric"
              min={1}
              max={maxDay}
              value={safeDay}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isNaN(n)) set({ jd: Math.min(maxDay, Math.max(1, Math.trunc(n))) });
              }}
              className="glass-input w-full min-w-0 rounded-xl px-1 py-2.5 text-center text-xs tabular-nums"
              aria-label="روز"
            />
          </label>
        </div>
        {preview ? (
          <p className="mt-2 text-center text-[11px] font-semibold text-secondary">{preview}</p>
        ) : null}
      </div>
    </div>
  );
}

/** Helper for form submission — returns ISO date from Jalali value. */
export function jalaliFieldToIso(value: JalaliDate): string {
  const maxDay = jalaliMonthLength(value.jy, value.jm);
  return jalaliYmdToIso({ ...value, jd: Math.min(value.jd, maxDay) });
}
