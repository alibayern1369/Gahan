"use client";

/**
 * Lightweight dependency-free SVG charts with full RTL and theme support.
 * Deliberately avoids heavy chart libraries to keep the bundle small.
 */

export interface ChartPoint {
  label: string;
  value: number;
}

export function BarChart({
  data,
  height = 160,
  formatValue,
}: {
  data: ChartPoint[];
  height?: number;
  formatValue?: (v: number) => string;
}) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div dir="rtl" className="w-full">
      <div className="flex items-end justify-between gap-1.5 sm:gap-2" style={{ height }}>
        {data.map((d, i) => {
          const h = Math.max(3, Math.round((d.value / max) * (height - 34)));
          return (
            <div key={i} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
              <span className="text-[10px] font-bold tabular-nums text-secondary opacity-0 transition-opacity group-hover:opacity-100">
                {formatValue ? formatValue(d.value) : d.value}
              </span>
              <div
                className="w-full max-w-9 rounded-t-lg bg-gradient-to-t from-brand-600/70 to-brand-400/90 transition-all duration-300 dark:from-brand-700/80 dark:to-brand-400/80"
                style={{ height: h }}
                title={`${d.label}: ${d.value}`}
              />
              <span className="max-w-full truncate text-[9px] leading-none text-faint">{d.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DonutChart({
  segments,
  size = 132,
  centerLabel,
  centerValue,
}: {
  segments: { label: string; value: number; colorClass: string }[];
  size?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = size / 2 - 11;
  const c = 2 * Math.PI * r;
  let offsetAcc = 0;

  return (
    <div dir="rtl" className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="نمودار دایره‌ای" className="shrink-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="14" className="stroke-black/6 dark:stroke-white/8" />
        {total > 0 &&
          segments.map((s, i) => {
            const frac = s.value / total;
            const dash = frac * c;
            const el = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                strokeWidth="14"
                strokeLinecap="butt"
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={-offsetAcc}
                className={s.colorClass}
              >
                <title>{`${s.label}: ${s.value}`}</title>
              </circle>
            );
            offsetAcc += dash;
            return el;
          })}
      </svg>
      <div className="min-w-0 flex-1 space-y-2">
        {centerValue !== undefined ? (
          <div className="mb-2">
            <div className="text-xl font-extrabold tabular-nums">{centerValue}</div>
            <div className="text-[10px] text-faint">{centerLabel}</div>
          </div>
        ) : null}
        {segments.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className={`size-2.5 shrink-0 rounded-full ${s.colorClass.replace("stroke-", "bg-")}`} aria-hidden />
            <span className="truncate text-secondary">{s.label}</span>
            <span className="mr-auto font-bold tabular-nums">{s.value.toLocaleString("fa-IR")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
