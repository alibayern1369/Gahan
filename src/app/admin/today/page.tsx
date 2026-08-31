import Link from "next/link";
import { Eye, Search } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { Badge } from "@/components/ui/badge";
import { GlassCard, SectionTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/server";
import { getReportSessions, type SessionRow } from "@/lib/reports";
import { AdminSelfieImage } from "@/components/admin/selfie-image";
import { dateToJalali, JALALI_MONTHS, persianWeekdayIndex, PERSIAN_WEEKDAYS } from "@/lib/jalali";
import { faNum, formatClockDuration, jalaliDayBoundsUTC, timeInTz } from "@/lib/format";
import { getSettings } from "@/lib/settings-server";

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "all", label: "همه" },
  { key: "present", label: "حاضر" },
  { key: "absent", label: "غایب" },
  { key: "late", label: "تأخیردار" },
  { key: "checked_out", label: "خروج زده" },
  { key: "working", label: "در محل کار" },
  { key: "suspicious", label: "مشکوک" },
] as const;

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; q?: string }>;
}) {
  const params = await searchParams;
  const settings = await getSettings();
  const filter = FILTERS.find((f) => f.key === (params.f ?? "all")) ?? FILTERS[0];
  const query = (params.q ?? "").trim();

  const now = new Date();
  const j = dateToJalali(now, settings.timezone);
  const { start, end } = jalaliDayBoundsUTC(j.jy, j.jm, j.jd, settings.timezone);
  const fromISO = start.toISOString().slice(0, 10);
  const toISO = new Date(end.getTime() - 1).toISOString().slice(0, 10);

  let sessions = await getReportSessions(fromISO, toISO);

  // absent employees = active profiles without a session today
  const supabase = await createClient();
  const { data: actives } = await supabase
    .from("profiles")
    .select("user_id, first_name, last_name, employee_code")
    .eq("role", "employee")
    .eq("employment_status", "active");

  if (filter.key === "absent") {
    const presentIds = new Set(sessions.map((s) => s.profile_id));
    const absentees = (actives ?? []).filter((p) => !presentIds.has(p.user_id));
    return (
      <>
        <AdminPageHeader
          title="حضور امروز"
          subtitle={`${PERSIAN_WEEKDAYS[persianWeekdayIndex(now, settings.timezone)]} ${faNum(j.jd)} ${JALALI_MONTHS[j.jm - 1]} ${faNum(j.jy)}`}
        />
        <FilterBar activeKey={filter.key} query="" />
        <GlassCard>
          {absentees.length === 0 ? (
            <EmptyState icon={Eye} title="همه حاضرند!" />
          ) : (
            <ul className="divide-y divide-[color:var(--border-line)]">
              {absentees.map((p) => (
                <li key={p.user_id} className="flex items-center justify-between px-5 py-3.5">
                  <span className="text-sm font-bold">
                    {p.first_name} {p.last_name}
                    {p.employee_code ? <span className="mr-2 text-[10px] font-normal text-faint">{p.employee_code}</span> : null}
                  </span>
                  <Badge tone="danger">غایب</Badge>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      </>
    );
  }

  if (filter.key === "suspicious") sessions = sessions.filter((s) => s.is_suspicious);
  else if (filter.key === "late") sessions = sessions.filter((s) => s.late_minutes > 0);
  else if (filter.key === "checked_out") sessions = sessions.filter((s) => s.checkout_at);
  else if (filter.key === "working") sessions = sessions.filter((s) => !s.checkout_at);

  if (query) {
    const q = query.toLowerCase();
    sessions = sessions.filter(
      (s) =>
        s.full_name.toLowerCase().includes(q) ||
        (s.employee_code ?? "").toLowerCase().includes(q) ||
        (s.workplace_name ?? "").includes(query)
    );
  }

  return (
    <>
      <AdminPageHeader
        title="حضور امروز"
        subtitle={`${PERSIAN_WEEKDAYS[persianWeekdayIndex(now, settings.timezone)]} ${faNum(j.jd)} ${JALALI_MONTHS[j.jm - 1]} ${faNum(j.jy)}`}
        action={<Badge tone="brand">{faNum(sessions.length)} رکورد</Badge>}
      />

      <FilterBar activeKey={filter.key} query={query} />

      <GlassCard className="overflow-hidden">
        {sessions.length === 0 ? (
          <EmptyState icon={Eye} title="رکوردی یافت نشد" description="فیلتر دیگری را امتحان کنید." />
        ) : (
          <>
            {/* desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--border-line)] text-right text-[11px] text-secondary">
                    <th scope="col" className="px-4 py-3 font-semibold">کارمند</th>
                    <th scope="col" className="px-4 py-3 font-semibold">وضعیت</th>
                    <th scope="col" className="px-4 py-3 font-semibold">ورود</th>
                    <th scope="col" className="px-4 py-3 font-semibold">خروج</th>
                    <th scope="col" className="px-4 py-3 font-semibold">کارکرد</th>
                    <th scope="col" className="px-4 py-3 font-semibold">تأخیر</th>
                    <th scope="col" className="px-4 py-3 font-semibold">محل کار</th>
                    <th scope="col" className="px-4 py-3 font-semibold">موقعیت</th>
                    <th scope="col" className="px-4 py-3 font-semibold">سلفی</th>
                    <th scope="col" className="px-2 py-3" aria-label="جزئیات" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--border-line)]">
                  {sessions.map((s) => (
                    <TodayRow key={s.session_id} s={s} timezone={settings.timezone} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* mobile cards */}
            <ul className="divide-y divide-[color:var(--border-line)] md:hidden">
              {sessions.map((s) => (
                <li key={s.session_id} className="flex items-center justify-between gap-3 px-4 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{s.full_name}</p>
                    <p dir="ltr" className="mt-0.5 text-[11px] tabular-nums text-secondary text-left">
                      {timeInTz(new Date(s.checkin_at), settings.timezone)} →{" "}
                      {s.checkout_at ? timeInTz(new Date(s.checkout_at), settings.timezone) : "..."}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {s.late_minutes > 0 ? <Badge tone="warning">تأخیر {faNum(s.late_minutes)}</Badge> : null}
                      {s.is_suspicious ? <Badge tone="danger">مشکوک</Badge> : null}
                      {!s.checkout_at ? <Badge tone="info">در محل کار</Badge> : null}
                    </div>
                  </div>
                  <Link href={`/admin/attendance/${s.session_id}`} aria-label={`جزئیات ${s.full_name}`} className="glass rounded-xl p-2.5">
                    <Eye className="size-4" />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </GlassCard>
    </>
  );
}

function TodayRow({ s, timezone }: { s: SessionRow; timezone: string }) {
  return (
    <tr className="transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.03]">
      <td className="px-4 py-3">
        <span className="font-bold">{s.full_name}</span>
        {s.employee_code ? <span className="block text-[10px] text-faint">{s.employee_code}</span> : null}
      </td>
      <td className="px-4 py-3">
        {s.is_suspicious ? (
          <Badge tone="danger">مشکوک</Badge>
        ) : !s.checkout_at ? (
          <Badge tone="info">در محل کار</Badge>
        ) : s.has_manual_adjustment ? (
          <Badge tone="warning">اصلاح‌شده</Badge>
        ) : (
          <Badge tone="success">کامل</Badge>
        )}
      </td>
      <td dir="ltr" className="px-4 py-3 tabular-nums text-left">{timeInTz(new Date(s.checkin_at), timezone)}</td>
      <td dir="ltr" className="px-4 py-3 tabular-nums text-left">{s.checkout_at ? timeInTz(new Date(s.checkout_at), timezone) : "—"}</td>
      <td dir="ltr" className="px-4 py-3 tabular-nums">{formatClockDuration(s.worked_minutes)}</td>
      <td dir="ltr" className="px-4 py-3 tabular-nums">{s.late_minutes > 0 ? `${faNum(s.late_minutes)} دقیقه` : "—"}</td>
      <td className="max-w-32 truncate px-4 py-3 text-xs text-secondary">{s.workplace_name ?? "—"}</td>
      <td className="px-4 py-3">
        {s.checkin_distance_m != null && s.allowed_radius_m ? (
          s.checkin_distance_m <= s.allowed_radius_m ? (
            <Badge tone="success">{faNum(Math.round(s.checkin_distance_m))} م</Badge>
          ) : (
            <Badge tone="danger">خارج از محدوده</Badge>
          )
        ) : (
          <span className="text-xs text-faint">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        {s.checkin_photo_deleted ? (
          <Badge tone="neutral">حذف‌شده</Badge>
        ) : s.checkin_photo_path ? (
          <AdminSelfieImage
            path={s.checkin_photo_path}
            label={`سلفی ${s.full_name}`}
            showLabel={false}
            className="size-9 rounded-lg object-cover ring-1 ring-black/10 dark:ring-white/10"
          />
        ) : (
          <span className="text-xs text-faint">—</span>
        )}
      </td>
      <td className="px-2 py-3">
        <Link href={`/admin/attendance/${s.session_id}`} aria-label={`جزئیات ${s.full_name}`} className="glass inline-block rounded-xl p-2.5 hover:text-brand-500">
          <Eye className="size-4" />
        </Link>
      </td>
    </tr>
  );
}

function FilterBar({ activeKey, query }: { activeKey: string; query: string }) {
  return (
    <SectionTitle
      title=""
      action={
        <div className="mb-4 flex w-full flex-wrap items-center gap-2">
          <form action="/admin/today" method="get" role="search" className="relative min-w-44 flex-1 sm:max-w-64">
            {activeKey !== "all" ? <input type="hidden" name="f" value={activeKey} /> : null}
            <Search className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
            <Input name="q" defaultValue={query} placeholder="جستجوی نام یا کد…" aria-label="جستجو" className="pr-10 py-2.5" />
          </form>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <Link
                key={f.key}
                href={`/admin/today${f.key === "all" ? "" : `?f=${f.key}`}${query ? `${f.key === "all" ? "?" : "&"}q=${encodeURIComponent(query)}` : ""}`}
                aria-current={activeKey === f.key ? "true" : undefined}
                className={`rounded-full px-3.5 py-2 text-[11px] font-bold transition-colors ${
                  activeKey === f.key
                    ? "bg-brand-500/15 text-brand-600 ring-1 ring-brand-500/30 ring-inset dark:text-brand-300"
                    : "glass text-secondary hover:text-brand-500"
                }`}
              >
                {f.label}
              </Link>
            ))}
          </div>
        </div>
      }
    />
  );
}
