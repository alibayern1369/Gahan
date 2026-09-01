"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  JALALI_MONTHS,
  PERSIAN_WEEKDAYS_SHORT,
  type JalaliDate,
  addJalaliMonths,
  buildJalaliMonthGrid,
  compareJalali,
  dateToJalali,
  jalaliMonthLength,
  jalaliYmdToIso,
  sameJalali,
} from "@/lib/jalali";
import { faNum } from "@/lib/format";
import { FieldLabel } from "@/components/ui/input";

function formatDisplay(d: JalaliDate): string {
  const safe = { ...d, jd: Math.min(d.jd, jalaliMonthLength(d.jy, d.jm)) };
  return `${faNum(safe.jd)} ${JALALI_MONTHS[safe.jm - 1]} ${faNum(safe.jy)}`;
}

function isDisabled(day: JalaliDate, minDate?: JalaliDate, maxDate?: JalaliDate): boolean {
  if (minDate && compareJalali(day, minDate) < 0) return true;
  if (maxDate && compareJalali(day, maxDate) > 0) return true;
  return false;
}

export function JalaliDateField({
  id,
  label,
  value,
  onChange,
  minDate,
  maxDate,
  placeholder = "انتخاب تاریخ…",
}: {
  id?: string;
  label: string;
  value: JalaliDate;
  onChange: (v: JalaliDate) => void;
  minDate?: JalaliDate;
  maxDate?: JalaliDate;
  placeholder?: string;
}) {
  const uid = useId();
  const fieldId = id ?? uid;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<JalaliDate>(() => ({ ...value }));
  const today = dateToJalali(new Date(), "Asia/Tehran");

  useEffect(() => {
    if (open) setView({ ...value });
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const cells = buildJalaliMonthGrid(view.jy, view.jm);

  function pick(day: JalaliDate) {
    if (isDisabled(day, minDate, maxDate)) return;
    onChange(day);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>
      <button
        id={fieldId}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="glass-input mt-1.5 flex w-full min-w-0 items-center justify-between gap-2 rounded-2xl px-4 py-3 text-sm transition-colors hover:border-brand-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring-color)]"
      >
        <span className={value ? "font-semibold text-[color:var(--text-primary)]" : "text-faint"}>
          {value ? formatDisplay(value) : placeholder}
        </span>
        <CalendarDays className="size-4 shrink-0 text-brand-500" aria-hidden />
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px] sm:hidden" aria-hidden onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-label={`تقویم ${label}`}
            className="pop-in fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 rounded-3xl border border-[color:var(--border-soft)] bg-[color:var(--surface-strong)] p-4 shadow-glass-lg backdrop-blur-xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:top-[calc(100%+0.5rem)] sm:right-0 sm:w-[min(100%,20rem)]"
          >
            <CalendarHeader
              view={view}
              onPrev={() => setView((v) => addJalaliMonths(v, -1))}
              onNext={() => setView((v) => addJalaliMonths(v, 1))}
            />

            <div className="mt-3 grid grid-cols-7 gap-0.5">
              {PERSIAN_WEEKDAYS_SHORT.map((wd) => (
                <div key={wd} className="py-1 text-center text-[10px] font-bold text-faint">
                  {wd}
                </div>
              ))}
              {cells.map((day, i) =>
                day ? (
                  <DayCell
                    key={`${day.jy}-${day.jm}-${day.jd}`}
                    day={day}
                    selected={sameJalali(day, value)}
                    today={sameJalali(day, today)}
                    disabled={isDisabled(day, minDate, maxDate)}
                    onPick={() => pick(day)}
                  />
                ) : (
                  <div key={`empty-${i}`} aria-hidden />
                )
              )}
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 border-t border-[color:var(--border-line)] pt-3">
              <button
                type="button"
                onClick={() => pick(today)}
                disabled={isDisabled(today, minDate, maxDate)}
                className="rounded-xl px-3 py-1.5 text-xs font-bold text-brand-600 transition-colors hover:bg-brand-500/10 disabled:opacity-40 dark:text-brand-300"
              >
                امروز
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-1.5 text-xs font-semibold text-secondary transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              >
                بستن
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function CalendarHeader({
  view,
  onPrev,
  onNext,
}: {
  view: JalaliDate;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={onNext}
        aria-label="ماه بعد"
        className="glass rounded-xl p-2 transition-colors hover:bg-brand-500/10"
      >
        <ChevronRight className="size-4" aria-hidden />
      </button>
      <div className="text-center">
        <div className="text-sm font-extrabold">{JALALI_MONTHS[view.jm - 1]}</div>
        <div className="text-[11px] text-faint">{faNum(view.jy)}</div>
      </div>
      <button
        type="button"
        onClick={onPrev}
        aria-label="ماه قبل"
        className="glass rounded-xl p-2 transition-colors hover:bg-brand-500/10"
      >
        <ChevronLeft className="size-4" aria-hidden />
      </button>
    </div>
  );
}

function DayCell({
  day,
  selected,
  today,
  disabled,
  onPick,
}: {
  day: JalaliDate;
  selected: boolean;
  today: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPick}
      aria-label={`${faNum(day.jd)} ${JALALI_MONTHS[day.jm - 1]} ${faNum(day.jy)}`}
      aria-pressed={selected}
      className={`aspect-square rounded-xl text-xs font-semibold tabular-nums transition-all ${
        selected
          ? "bg-brand-500 text-white shadow-md shadow-brand-500/30"
          : today
            ? "bg-brand-500/12 text-brand-600 ring-1 ring-brand-500/35 dark:text-brand-300"
            : disabled
              ? "cursor-not-allowed text-faint/40"
              : "text-[color:var(--text-primary)] hover:bg-brand-500/10"
      }`}
    >
      {faNum(day.jd)}
    </button>
  );
}

/** Helper for form submission — returns ISO date from Jalali value. */
export function jalaliFieldToIso(value: JalaliDate): string {
  const maxDay = jalaliMonthLength(value.jy, value.jm);
  return jalaliYmdToIso({ ...value, jd: Math.min(value.jd, maxDay) });
}
