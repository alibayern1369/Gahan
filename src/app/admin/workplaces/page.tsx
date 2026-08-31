import { AdminPageHeader } from "@/components/admin/admin-shell";
import { WorkplacesManager, type WorkplaceRow } from "@/components/admin/workplaces-manager";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function WorkplacesPage() {
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
        subtitle="تعریف محل‌های مختلف (فرودگاه، سالن اداری، درب خروج…) با انتخاب GPS روی نقشه"
      />
      <WorkplacesManager workplaces={(workplaces ?? []) as unknown as WorkplaceRow[]} />
    </>
  );
}
