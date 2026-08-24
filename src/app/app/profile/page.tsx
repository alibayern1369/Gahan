import { Badge } from "@/components/ui/badge";
import { GlassCard, SectionTitle } from "@/components/ui/card";
import { FieldLabel } from "@/components/ui/input";
import { ChangePasswordForm } from "@/components/change-password-form";
import { SignOutButton } from "@/components/sign-out-button";
import { requireAuth } from "@/lib/auth";
import { formatJalaliShort } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const { profile } = await requireAuth();

  return (
    <div className="space-y-5 pb-6">
      <SectionTitle title="حساب کاربری" />

      <GlassCard strong className="flex items-center gap-4 p-5">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-bl from-brand-500 to-brand-700 text-2xl font-black text-white">
          {profile.first_name.charAt(0)}
          {profile.last_name.charAt(0)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-extrabold">
            {profile.first_name} {profile.last_name}
          </p>
          <p dir="ltr" className="mt-0.5 truncate text-xs text-secondary text-left">
            {profile.email}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone={profile.employment_status === "active" ? "success" : "danger"}>
              {profile.employment_status === "active" ? "فعال" : "غیرفعال"}
            </Badge>
            {profile.employee_code ? <Badge>کد: {profile.employee_code}</Badge> : null}
          </div>
        </div>
      </GlassCard>

      <GlassCard className="space-y-4 p-5">
        <InfoRow label="نام و نام خانوادگی" value={`${profile.first_name} ${profile.last_name}`} />
        <InfoRow label="کد کارمندی" value={profile.employee_code ?? "—"} />
        <InfoRow label="شماره تماس" value={profile.phone ?? "—"} />
        <InfoRow label="تاریخ استخدام" value={profile.hired_at ? formatJalaliShort(new Date(profile.hired_at)) : "—"} />
        {profile.notes ? <InfoRow label="یادداشت مدیر" value={profile.notes} /> : null}
      </GlassCard>

      <GlassCard className="p-5">
        <SectionTitle title="امنیت حساب" subtitle="پس از اولین ورود، گذرواژه موقت را عوض کنید." />
        <ChangePasswordForm />
      </GlassCard>

      <SignOutButton label="خروج از حساب" variant="secondary" full icon={<span aria-hidden>⏻</span>} />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[color:var(--border-line)] pb-3 last:border-b-0 last:pb-0">
      <FieldLabel>{label}</FieldLabel>
      <span className="text-left text-sm font-semibold">{value}</span>
    </div>
  );
}
