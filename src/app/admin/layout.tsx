import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { BrandMark } from "@/components/brand-mark";
import { getPendingLeaveCount } from "@/lib/actions/leave";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "پنل مدیریت", template: "%s | گاهان" },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const [settings, pendingLeave] = await Promise.all([getSettings(), getPendingLeaveCount()]);

  return (
    <AdminShell
      orgName={settings.organization_name}
      brand={<BrandMark size="md" />}
      pendingLeave={pendingLeave}
    >
      {children}
    </AdminShell>
  );
}
