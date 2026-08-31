import { AdminPageHeader } from "@/components/admin/admin-shell";
import { SchedulesManager, type ScheduleRow } from "@/components/admin/schedules-manager";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SchedulesPage() {
  const supabase = await createClient();
  const { data: schedules } = await supabase.from("work_schedules").select("*").order("name");

  return (
    <>
      <AdminPageHeader title="برنامه‌های کاری" subtitle="ساعت شروع/پایان، گرِیس تأخیر و روزهای کاری" />
      <SchedulesManager schedules={(schedules ?? []) as unknown as ScheduleRow[]} />
    </>
  );
}
