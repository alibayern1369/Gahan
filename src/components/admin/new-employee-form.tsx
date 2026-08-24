"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input, Textarea } from "@/components/ui/input";
import { GlassCard } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { createEmployeeAction } from "@/lib/actions/admin";

export function NewEmployeeForm({
  workplaces,
  schedules,
}: {
  workplaces: Array<{ id: number; name: string }>;
  schedules: Array<{ id: number; name: string }>;
}) {
  const [pending, setPending] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [createdEmail, setCreatedEmail] = useState("");
  const router = useRouter();
  const { toast } = useToast();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      first_name: String(fd.get("first_name") ?? "").trim(),
      last_name: String(fd.get("last_name") ?? "").trim(),
      employee_code: String(fd.get("employee_code") ?? "").trim(),
      email: String(fd.get("email") ?? "").trim().toLowerCase(),
      phone: String(fd.get("phone") ?? "").trim(),
      hired_at: String(fd.get("hired_at") ?? ""),
      notes: String(fd.get("notes") ?? "").trim(),
      workplace_id: fd.get("workplace_id") ? Number(fd.get("workplace_id")) : null,
      schedule_id: fd.get("schedule_id") ? Number(fd.get("schedule_id")) : null,
    };

    if (!payload.first_name || !payload.last_name || !payload.email) {
      toast("error", "نام، نام خانوادگی و ایمیل الزامی است.");
      return;
    }

    setPending(true);
    const result = await createEmployeeAction(payload);
    setPending(false);

    if (result.ok) {
      setTempPassword(result.tempPassword);
      setCreatedEmail(payload.email);
      router.refresh();
    } else {
      toast("error", result.error);
    }
  }

  if (tempPassword) {
    return (
      <GlassCard strong className="pop-in space-y-4 p-6 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-mint-500/15 text-mint-500">
          <KeyRound className="size-6" aria-hidden />
        </div>
        <h2 className="text-base font-extrabold">کارمند ساخته شد</h2>
        <p className="text-xs leading-6 text-secondary">
          این گذرواژهٔ موقت فقط همین یک بار نمایش داده می‌شود. آن را برای کارمند ارسال کنید و از او بخواهید در اولین ورود عوضش کند.
        </p>
        <div dir="ltr" className="mx-auto flex max-w-xs items-center gap-2 rounded-2xl bg-black/5 px-4 py-3 dark:bg-white/10">
          <code className="flex-1 select-all font-bold">{tempPassword}</code>
          <button
            type="button"
            aria-label="کپی گذرواژه"
            onClick={async () => {
              await navigator.clipboard.writeText(tempPassword);
              toast("success", "گذرواژه کپی شد.");
            }}
            className="rounded-lg p-1.5 hover:text-brand-500"
          >
            <Copy className="size-4" />
          </button>
        </div>
        <p dir="ltr" className="text-[11px] text-faint">{createdEmail}</p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => setTempPassword(null)}>ساخت کارمند بعدی</Button>
          <Link href="/admin/employees">
            <Button variant="primary" className="w-full">بازگشت به فهرست</Button>
          </Link>
        </div>
      </GlassCard>
    );
  }

  return (
    <form onSubmit={submit} className="glass space-y-4 rounded-3xl p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="first_name">نام *</FieldLabel>
          <Input id="first_name" name="first_name" required maxLength={80} />
        </div>
        <div>
          <FieldLabel htmlFor="last_name">نام خانوادگی *</FieldLabel>
          <Input id="last_name" name="last_name" required maxLength={80} />
        </div>
        <div>
          <FieldLabel htmlFor="email">ایمیل (نام کاربری ورود) *</FieldLabel>
          <Input id="email" name="email" type="email" dir="ltr" required />
        </div>
        <div>
          <FieldLabel htmlFor="employee_code">کد کارمندی</FieldLabel>
          <Input id="employee_code" name="employee_code" dir="ltr" maxLength={40} />
        </div>
        <div>
          <FieldLabel htmlFor="phone">شماره تماس</FieldLabel>
          <Input id="phone" name="phone" dir="ltr" inputMode="tel" maxLength={30} />
        </div>
        <div>
          <FieldLabel htmlFor="hired_at" hint="میلادی YYYY-MM-DD">تاریخ استخدام</FieldLabel>
          <Input id="hired_at" name="hired_at" type="date" dir="ltr" />
        </div>
        <div>
          <FieldLabel htmlFor="workplace_id">محل کاری</FieldLabel>
          <select id="workplace_id" name="workplace_id" className="glass-input w-full appearance-none rounded-2xl px-4 py-3 text-sm">
            <option value="">— انتخاب نشده —</option>
            {workplaces.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel htmlFor="schedule_id">برنامه کاری</FieldLabel>
          <select id="schedule_id" name="schedule_id" className="glass-input w-full appearance-none rounded-2xl px-4 py-3 text-sm">
            <option value="">— پیش‌فرض سازمان —</option>
            {schedules.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <FieldLabel htmlFor="notes">یادداشت</FieldLabel>
        <Textarea id="notes" name="notes" maxLength={1000} />
      </div>
      <Button type="submit" loading={pending} size="lg" className="w-full sm:w-auto">
        ساخت حساب کارمند
      </Button>
      <p className="text-[11px] leading-5 text-faint">
        یک گذرواژهٔ موقت امن به‌صورت خودکار ساخته می‌شود؛ پس از ساخت، یک بار نمایش داده می‌شود.
      </p>
    </form>
  );
}
