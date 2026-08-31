import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { EditEmployeeForm, type EditableEmployee } from "@/components/admin/edit-employee-form";
import { Badge } from "@/components/ui/badge";
import { GlassCard, SectionTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { createClient } from "@/lib/supabase/server";
import { getEmployeeSummary } from "@/lib/reports";
import { getLeaveBalance } from "@/lib/actions/leave";
import { dateToJalali } from "@/lib/jalali";
import { faNum, formatClockDuration, timeInTz } from "@/lib/format";
import { getSettings } from "@/lib/settings-server";

export const dynamic = "force-dynamic";

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: userId } = await params;
  const settings = await getSettings();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (!profile) notFound();

  const [{ data: workplaces }, { data: schedules }, { data: assignments }, { data: scheduleAssign }] =
    await Promise.all([
      supabase.from("workplaces").select("id, name").order("name"),
      supabase.from("work_schedules").select("id, name").order("name"),
      supabase.from("employee_workplaces").select("workplace_id").eq("profile_id", userId),
      supabase.from("employee_schedules").select("schedule_id").eq("profile_id", userId).maybeSingle(),
    ]);

  // current jalali month range for summary
  const now = new Date();
  const jNow = dateToJalali(now, settings.timezone);
  const { jalaliToIsoDate } = await import("@/lib/reports");
  const monthStartISO = jalaliToIsoDate({ jy: jNow.jy, jm: jNow.jm, jd: 1 });
  const todayISO = jalaliToIsoDate({ ...jNow });

  const summaries = await getEmployeeSummary(monthStartISO, todayISO);
  const summary = summaries.find((s) => s.profile_id === userId) ?? null;
  const leaveBalance = await getLeaveBalance(userId);

  const { data: recent } = await supabase
    .from("attendance_sessions")
    .select("id, checkin_at, checkout_at, late_minutes, worked_minutes")
    .eq("profile_id", userId)
    .order("checkin_at", { ascending: false })
    .limit(10);

  const editable: EditableEmployee = {
    user_id: profile.user_id,
    first_name: profile.first_name,
    last_name: profile.last_name,
    employee_code: profile.employee_code,
    email: profile.email,
    phone: profile.phone,
    hired_at: profile.hired_at,
    notes: profile.notes,
    employment_status: profile.employment_status,
    workplace_ids: (assignments ?? []).map((a) => a.workplace_id),
    schedule_id: scheduleAssign?.schedule_id ?? null,
  };

  return (
    <>
      <Link href="/admin/employees" className="mb-4 inline-flex items-center gap-1 text-xs font-bold text-secondary hover:text-brand-500">
        <ArrowRight className="size-4" aria-hidden /> بازگشت به کارمندان
      </Link>

      <AdminPageHeader
        title={`${profile.first_name} ${profile.last_name}`}
        subtitle={profile.employee_code ? `کد: ${profile.employee_code}` : undefined}
        action={
          <Badge tone={profile.employment_status === "active" ? "success" : "neutral"}>
            {profile.employment_status === "active" ? "فعال" : "غیرفعال"}
          </Badge>
        }
      />

      {/* summary cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <SummaryBox label="روزهای کاری انتظاری (ماه)" value={faNum(summary?.expected_days ?? 0)} />
        <SummaryBox label="حاضر" value={faNum(summary?.present_days ?? 0)} tone="success" />
        <SummaryBox label="غایب" value={faNum(summary?.absent_days ?? 0)} tone={(summary?.absent_days ?? 0) > 0 ? "danger" : undefined} />
        <SummaryBox label="مرخصی (ماه)" value={faNum(summary?.leave_days ?? 0)} tone="info" />
        <SummaryBox label="استحقاقی باقی" value={faNum(leaveBalance?.entitlement_remaining ?? 0)} />
        <SummaryBox label="استعلاجی باقی" value={faNum(leaveBalance?.sick_remaining ?? 0)} />
        <SummaryBox label="مجموع تأخیر" value={formatClockDuration(Number(summary?.late_minutes_total ?? 0))} tone={(summary?.late_minutes_total ?? 0) > 0 ? "warning" : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <EditEmployeeForm
            employee={editable}
            workplaces={workplaces ?? []}
            schedules={schedules ?? []}
          />
        </div>

        <GlassCard className="p-5">
          <SectionTitle title="آخرین حضورها" />
          {(recent ?? []).length === 0 ? (
            <EmptyState icon={ArrowRight} title="رکوردی ندارد" />
          ) : (
            <ul className="space-y-2.5">
              {(recent ?? []).map((s) => (
                <li key={s.id}>
                  <Link href={`/admin/attendance/${s.id}`} className="flex items-center justify-between rounded-2xl px-3 py-2.5 transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]">
                    <span dir="ltr" className="text-[11px] tabular-nums text-secondary text-left">
                      {timeInTz(new Date(s.checkin_at), settings.timezone)} →{" "}
                      {s.checkout_at ? timeInTz(new Date(s.checkout_at), settings.timezone) : "..."}
                    </span>
                    <span className={`text-[11px] font-bold tabular-nums ${s.late_minutes > 0 ? "text-amber-500" : ""}`}>
                      {s.late_minutes > 0 ? `${faNum(s.late_minutes)} دق` : formatClockDuration(s.worked_minutes)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[10px] text-faint">خلاصهٔ ماه جلالی جاری</p>
        </GlassCard>
      </div>
    </>
  );
}

function SummaryBox({ label, value, tone }: { label: string; value: string; tone?: "success" | "warning" | "danger" | "info" }) {
  const tones: Record<string, string> = {
    success: "text-mint-500",
    warning: "text-amber-500",
    danger: "text-rose-500",
    info: "text-sky-500",
  };
  return (
    <GlassCard className="p-3.5">
      <div className={`text-lg font-extrabold tabular-nums ${tone ? tones[tone] : ""}`}>{value}</div>
      <div className="mt-0.5 text-[10px] leading-4 text-faint">{label}</div>
    </GlassCard>
  );
}
