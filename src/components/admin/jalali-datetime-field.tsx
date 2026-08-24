"use client";

import { useMemo } from "react";
import { JALALI_MONTHS, jalaliToGregorianDate } from "@/lib/jalali";

export interface JalaliDateTimeValue {
  jy: number;
  jm: number;
  jd: number;
  hh: number;
  mm: number;
}

/**
 * Jalali date + time picker built on native inputs (no heavy deps).
 * Shows a live Gregorian preview so admins can sanity-check conversions.
 */
export function JalaliDateTimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: JalaliDateTimeValue;
  onChange: (v: JalaliDateTimeValue) => void;
}) {
  const set = (patch: Partial<JalaliDateTimeValue>) => onChange({ ...value, ...patch });

  return (
    <fieldset className="rounded-2xl border border-[color:var(--border-line)] p-3">
      <legend className="px-1.5 text-[11px] font-semibold text-secondary">{label}</legend>
      <div className="flex flex-wrap items-end gap-2">
        <NumBox label="سال" value={value.jy} min={1300} max={1500} onChange={(n) => set({ jy: n })} />
        <label className="min-w-28 flex-1">
          <span className="mb-1 block text-center text-[10px] text-faint">ماه</span>
          <select
            aria-label="ماه"
            value={value.jm}
            onChange={(e) => set({ jm: Number(e.target.value) })}
            className="glass-input w-full rounded-xl px-2 py-2 text-xs"
          >
            {JALALI_MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <NumBox label="روز" value={value.jd} min={1} max={31} onChange={(n) => set({ jd: n })} />
        <NumBox label="ساعت" value={value.hh} min={0} max={23} onChange={(n) => set({ hh: n })} pad />
        <NumBox label="دقیقه" value={value.mm} min={0} max={59} onChange={(n) => set({ mm: n })} pad />
      </div>
      <GregorianHint value={value} />
    </fieldset>
  );
}

function NumBox({
  label,
  value,
  min,
  max,
  onChange,
  pad,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  pad?: boolean;
}) {
  return (
    <label className="w-16">
      <span className="mb-1 block text-center text-[10px] text-faint">{label}</span>
      <input
        type="number"
        dir="ltr"
        min={min}
        max={max}
        value={pad ? String(value).padStart(2, "0") : value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) onChange(Math.min(max, Math.max(min, Math.trunc(n))));
        }}
        className="glass-input w-full rounded-xl px-1 py-2 text-center text-xs tabular-nums"
      />
    </label>
  );
}

function GregorianHint({ value }: { value: JalaliDateTimeValue }) {
  const hint = useMemo(() => {
    try {
      const d = jalaliToGregorianDate(value.jy, value.jm, value.jd);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    } catch {
      return "";
    }
  }, [value.jy, value.jm, value.jd]);

  if (!hint) return null;
  return (
    <p dir="ltr" className="mt-2 text-center text-[10px] text-faint">
      Gregorian: {hint}
    </p>
  );
}
