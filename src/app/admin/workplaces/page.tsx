import { AdminPageHeader } from "@/components/admin/admin-shell";
import { WorkplacesManager, type WorkplaceRow } from "@/components/admin/workplaces-manager";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function WorkplacesPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: workplaces } = await supabase
    .from("workplaces")
    .select("*")
    .order("is_active", { ascending: false })
    .order("name");

  return (
    <>
      <AdminPageHeader
        title="موقعیت‌های کاری"
        subtitle="محل‌های مجاز ثبت حضور و شعاع تحمل هر کدام"
      />
      <WorkplacesManager workplaces={(workplaces ?? []) as unknown as WorkplaceRow[]} />
    </>
  );
}
