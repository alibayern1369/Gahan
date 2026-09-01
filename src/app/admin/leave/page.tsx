import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { AdminLeavePanel } from "@/components/admin/admin-leave-panel";
import { createClient } from "@/lib/supabase/server";
import { getAllLeaveRequests, getLeaveBalance } from "@/lib/actions/leave";
import { getSettings } from "@/lib/settings-server";
import { syncIranHolidaysToDb } from "@/lib/iran-holidays";
import type { LeaveRequestStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "pending", label: "در انتظار" },
  { key: "approved", label: "تأیید شده" },
  { key: "rejected", label: "رد شده" },
  { key: "all", label: "همه" },
] as const;

export default async function AdminLeavePage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>;
}) {
  const params = await searchParams;
  const filter = (params.f ?? "pending") as string;
  const settings = await getSettings();

  await syncIranHolidaysToDb().catch(() => undefined);

  const statusFilter: LeaveRequestStatus | undefined =
    filter === "approved" || filter === "rejected" || filter === "pending" ? filter : undefined;

  const requestsResult = await getAllLeaveRequests(statusFilter);
  const requests = requestsResult.data;

  const supabase = await createClient();
  const { data: employees } = await supabase
    .from("profiles")
    .select("user_id, first_name, last_name")
    .eq("role", "employee")
    .eq("employment_status", "active")
    .order("first_name");

  const balances = await Promise.all(
    (employees ?? []).map(async (e) => ({
      profile_id: e.user_id,
      full_name: `${e.first_name} ${e.last_name}`,
      balance: await getLeaveBalance(e.user_id),
    }))
  );

  return (
    <>
      <AdminPageHeader title="مدیریت مرخصی" subtitle="بررسی درخواست‌ها و موجودی کارمندان" />

      <nav aria-label="فیلتر وضعیت" className="mb-5 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/admin/leave${f.key === "pending" ? "" : `?f=${f.key}`}`}
            aria-current={filter === f.key ? "true" : undefined}
            className={`rounded-full px-4 py-2 text-xs font-bold transition-colors ${
              filter === f.key
                ? "bg-brand-500/15 text-brand-600 ring-1 ring-inset ring-brand-500/30 dark:text-brand-300"
                : "glass text-secondary hover:text-brand-500"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      <AdminLeavePanel
        requests={requests}
        balances={balances}
        timezone={settings.timezone}
        filter={filter}
        loadError={requestsResult.ok ? undefined : requestsResult.error}
      />
    </>
  );
}
