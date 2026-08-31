import { AdminPageHeader } from "@/components/admin/admin-shell";
import { NewEmployeeForm } from "@/components/admin/new-employee-form";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewEmployeePage() {
  const supabase = await createClient();

  const [{ data: workplaces }, { data: schedules }] = await Promise.all([
    supabase.from("workplaces").select("id, name").eq("is_active", true).order("name"),
    supabase.from("work_schedules").select("id, name").order("name"),
  ]);

  return (
    <>
      <AdminPageHeader title="افزودن کارمند جدید" subtitle="حساب ورود + پروفایل در یک مرحله ساخته می‌شود." />
      <NewEmployeeForm workplaces={workplaces ?? []} schedules={schedules ?? []} />
    </>
  );
}
