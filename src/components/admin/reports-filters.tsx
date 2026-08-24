"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/input";
import { dateToJalali, jalaliToGregorianDate } from "@/lib/jalali";

export interface ReportFilterOptions {
  employees: Array<{ user_id: string; name: string }>;
  workplaces: Array<{ id: number; name: string }>;
  today: { jy: number; jm: number; jd: number };
}

const PRESETS = [
  { key: "today", label: "امروز" },
  { key: "week", label: "این هفته" },
  { key: "month", label: "این ماه" },
  { key: "lastmonth", label: "ماه گذشته" },
] as const;

const STATUSES = [
  { key: "all", label: "همه وضعیت‌ها" },
  { key: "present", label: "حاضر" },
  { key: "late", label: "تأخیردار" },
  { key: "open", label: "بدون خروج" },
] as const;

function addDays(d: { jy: number; jm: number; jd: number }, days: number) {
  const g = jalaliToGregorianDate(d.jy, d.jm, d.jd);
  return dateToJalali(new Date(g.getTime() + days * 86_400_000), "UTC");
}

export function ReportsFilters({ options }: { options: ReportFilterOptions }) {
  const params = useSearchParams();
  const router = useRouter();
  const preset = params.get("p") ?? "month";

  const [customOpen, setCustomOpen] = useState(preset === "custom");

  function go(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === "") sp.delete(k);
      else sp.set(k, v);
    }
    router.push(`/admin/reports?${sp.toString()}`);
  }

  const weekStart = addDays(options.today, -6);

  return (
    <div className="space-y-3">
      {/* presets */}
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => {
              setCustomOpen(false);
              go({ p: p.key, from: null, to: null });
            }}
            aria-pressed={preset === p.key && !customOpen}
            className={`rounded-full px-4 py-2 text-xs font-bold transition-colors ${
              preset === p.key && !customOpen
                ? "bg-brand-500/15 text-brand-600 ring-1 ring-inset ring-brand-500/30 dark:text-brand-300"
                : "glass text-secondary hover:text-brand-500"
            }`}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => {
            setCustomOpen(true);
            go({ p: "custom" });
          }}
          aria-pressed={customOpen}
          className={`rounded-full px-4 py-2 text-xs font-bold transition-colors ${
            customOpen
              ? "bg-brand-500/15 text-brand-600 ring-1 ring-inset ring-brand-500/30 dark:text-brand-300"
              : "glass text-secondary hover:text-brand-500"
          }`}
        >
          بازه دلخواه
        </button>
      </div>

      {/* custom range */}
      {customOpen ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            go({
              p: "custom",
              from: `${fd.get("fy")}-${fd.get("fm")}-${fd.get("fd")}`,
              to: `${fd.get("ty")}-${fd.get("tm")}-${fd.get("td")}`,
            });
          }}
          className="glass flex flex-wrap items-end gap-3 rounded-2xl p-4"
        >
          <DateBox prefix="f" legend="از تاریخ" def={weekStart} />
          <DateBox prefix="t" legend="تا تاریخ" def={options.today} />
          <Button type="submit" size="sm">اعمال</Button>
        </form>
      ) : null}

      {/* employee/workplace/status + exports */}
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-40">
          <FieldLabel>کارمند</FieldLabel>
          <select
            value={params.get("emp") ?? ""}
            onChange={(e) => go({ emp: e.target.value || null })}
            className="glass-input w-full appearance-none rounded-xl px-3 py-2.5 text-xs"
          >
            <option value="">همه</option>
            {options.employees.map((e) => (
              <option key={e.user_id} value={e.user_id}>{e.name}</option>
            ))}
          </select>
        </label>

        <label className="min-w-36">
          <FieldLabel>محل کار</FieldLabel>
          <select
            value={params.get("wp") ?? ""}
            onChange={(e) => go({ wp: e.target.value || null })}
            className="glass-input w-full appearance-none rounded-xl px-3 py-2.5 text-xs"
          >
            <option value="">همه</option>
            {options.workplaces.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </label>

        <label className="min-w-36">
          <FieldLabel>وضعیت</FieldLabel>
          <select
            value={params.get("st") ?? "all"}
            onChange={(e) => go({ st: e.target.value })}
            className="glass-input w-full appearance-none rounded-xl px-3 py-2.5 text-xs"
          >
            {STATUSES.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </label>

        <div className="mr-auto flex gap-1.5">
          <a href={`/api/admin/export?format=csv&${params.toString()}`}>
            <Button variant="secondary" size="sm" type="button">
              <FileDown className="size-3.5" aria-hidden /> خروجی CSV
            </Button>
          </a>
          <a href={`/api/admin/export?format=xls&${params.toString()}`}>
            <Button variant="secondary" size="sm" type="button">
              <FileDown className="size-3.5" aria-hidden /> خروجی اکسل
            </Button>
          </a>
        </div>
      </div>
    </div>
  );
}

function DateBox({
  prefix,
  legend,
  def,
}: {
  prefix: string;
  legend: string;
  def: { jy: number; jm: number; jd: number };
}) {
  return (
    <fieldset className="rounded-2xl border border-[color:var(--border-line)] p-2.5">
      <legend className="px-1 text-[10px] font-semibold text-secondary">{legend}</legend>
      <div className="flex items-center gap-1.5">
        <input name={`${prefix}y`} type="number" dir="ltr" defaultValue={def.jy} min={1300} max={1500} aria-label="سال" className="glass-input w-16 rounded-lg px-1 py-2 text-center text-xs tabular-nums" />
        <input name={`${prefix}m`} type="number" dir="ltr" defaultValue={def.jm} min={1} max={12} aria-label="ماه" className="glass-input w-12 rounded-lg px-1 py-2 text-center text-xs tabular-nums" />
        <input name={`${prefix}d`} type="number" dir="ltr" defaultValue={def.jd} min={1} max={31} aria-label="روز" className="glass-input w-12 rounded-lg px-1 py-2 text-center text-xs tabular-nums" />
      </div>
    </fieldset>
  );
}
