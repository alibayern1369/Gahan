import Link from "next/link";
import { Eye, Search, UserPlus } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; s?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const query = (params.q ?? "").trim().toLowerCase();
  const statusFilter = params.s ?? "active";

  const supabase = await createClient();

  let selectQuery = supabase
    .from("profiles")
    .select(
      `user_id, first_name, last_name, employee_code, email, phone,
       employment_status, hired_at,
       employee_workplaces(workplaces(name)),
       employee_schedules(work_schedules(name))`
    )
    .eq("role", "employee")
    .order("first_name");

  if (statusFilter === "active" || statusFilter === "inactive") {
    selectQuery = selectQuery.eq("employment_status", statusFilter);
  }

  const { data: employees } = await selectQuery.limit(200);

  interface EmpRow {
    user_id: string;
    first_name: string;
    last_name: string;
    employee_code: string | null;
    email: string | null;
    employment_status: string;
    employee_workplaces?: Array<{ workplaces?: { name: string } | null }>;
    employee_schedules?: Array<{ work_schedules?: { name: string } | null }>;
  }

  const allRows = (employees ?? []) as unknown as EmpRow[];
  const rows = allRows.filter((e) => {
    if (!query) return true;
    return (
      e.first_name.toLowerCase().includes(query) ||
      e.last_name.toLowerCase().includes(query) ||
      (e.employee_code ?? "").toLowerCase().includes(query) ||
      (e.email ?? "").toLowerCase().includes(query)
    );
  });

  return (
    <>
      <AdminPageHeader
        title="کارمندان"
        subtitle={`${faCount(rows.length)} نفر`}
        action={
          <Link href="/admin/employees/new">
            <UserPlus className="mr-1 inline size-4" aria-hidden /> افزودن کارمند
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form action="/admin/employees" method="get" role="search" className="relative min-w-44 flex-1 sm:max-w-72">
          {statusFilter !== "all" ? <input type="hidden" name="s" value={statusFilter} /> : null}
          <Search className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <Input name="q" defaultValue={params.q ?? ""} placeholder="جستجوی نام، کد یا ایمیل…" aria-label="جستجو" className="pr-10 py-2.5" />
        </form>
        <div className="flex gap-1.5">
          {[
            { key: "active", label: "فعال" },
            { key: "inactive", label: "غیرفعال" },
            { key: "all", label: "همه" },
          ].map((s) => (
            <Link
              key={s.key}
              href={`/admin/employees?s=${s.key}`}
              aria-current={statusFilter === s.key ? "true" : undefined}
              className={`rounded-full px-3.5 py-2 text-[11px] font-bold transition-colors ${
                statusFilter === s.key
                  ? "bg-brand-500/15 text-brand-600 ring-1 ring-inset ring-brand-500/30 dark:text-brand-300"
                  : "glass text-secondary hover:text-brand-500"
              }`}
            >
              {s.label}
            </Link>
          ))}
        </div>
      </div>

      <GlassCard className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon={UserPlus} title="کارمندی یافت نشد" description="اولین کارمند را با دکمهٔ «افزودن کارمند» بسازید." />
        ) : (
          <ul className="divide-y divide-[color:var(--border-line)]">
            {rows.map((e) => {
              const workplaceName = e.employee_workplaces?.[0]?.workplaces?.name ?? null;
              const scheduleName = e.employee_schedules?.[0]?.work_schedules?.name ?? null;

              return (
                  <li key={e.user_id} className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-bl from-brand-400 to-brand-700 text-sm font-black text-white">
                        {e.first_name.charAt(0)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">
                          {e.first_name} {e.last_name}
                          {e.employee_code ? <span className="mr-2 text-[10px] font-normal text-faint">{e.employee_code}</span> : null}
                        </p>
                        <p dir="ltr" className="truncate text-[11px] text-secondary text-left">
                          {e.email}
                        </p>
                        <p className="mt-1 hidden gap-1.5 sm:flex sm:flex-wrap">
                          {workplaceName ? <Badge>{workplaceName}</Badge> : null}
                          {scheduleName ? <Badge tone="info">{scheduleName}</Badge> : null}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone={e.employment_status === "active" ? "success" : "neutral"}>
                        {e.employment_status === "active" ? "فعال" : "غیرفعال"}
                      </Badge>
                      <Link href={`/admin/employees/${e.user_id}`} aria-label={`مشاهده پروفایل ${e.first_name}`} className="glass rounded-xl p-2.5 hover:text-brand-500">
                        <Eye className="size-4" />
                      </Link>
                    </div>
                  </li>
              );
            })}
          </ul>
        )}
      </GlassCard>
    </>
  );
}

function faCount(n: number): string {
  return n.toLocaleString("fa-IR");
}
