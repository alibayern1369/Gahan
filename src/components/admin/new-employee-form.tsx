"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input, Textarea } from "@/components/ui/input";
import { GlassCard } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { createEmployeeAction } from "@/lib/actions/admin";
import { WorkplaceMultiSelect } from "@/components/admin/workplace-multi-select";

export function NewEmployeeForm({
  workplaces,
  schedules,
}: {
  workplaces: Array<{ id: number; name: string }>;
  schedules: Array<{ id: number; name: string }>;
}) {
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState(false);
  const [createdUsername, setCreatedUsername] = useState("");
  const [workplaceIds, setWorkplaceIds] = useState<number[]>([]);
  const router = useRouter();
  const { toast } = useToast();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("password") ?? "");
    const passwordConfirm = String(fd.get("password_confirm") ?? "");
    const payload = {
      first_name: String(fd.get("first_name") ?? "").trim(),
      last_name: String(fd.get("last_name") ?? "").trim(),
      employee_code: String(fd.get("employee_code") ?? "").trim(),
      username: String(fd.get("username") ?? "").trim(),
      password,
      phone: String(fd.get("phone") ?? "").trim(),
      hired_at: String(fd.get("hired_at") ?? ""),
      notes: String(fd.get("notes") ?? "").trim(),
      workplace_ids: workplaceIds,
      schedule_id: fd.get("schedule_id") ? Number(fd.get("schedule_id")) : null,
    };

    if (!payload.first_name || !payload.last_name || !payload.username) {
      toast("error", "نام، نام خانوادگی و نام کاربری الزامی است.");
      return;
    }
    if (!password) {
      toast("error", "گذرواژه را وارد کنید.");
      return;
    }
    if (password !== passwordConfirm) {
      toast("error", "گذرواژه و تکرار آن یکسان نیست.");
      return;
    }

    setPending(true);
    const result = await createEmployeeAction(payload);
    setPending(false);

    if (result.ok) {
      setCreated(true);
      setCreatedUsername(payload.username);
      router.refresh();
    } else {
      toast("error", result.error);
    }
  }

  if (created) {
    return (
      <GlassCard strong className="pop-in space-y-4 p-6 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-mint-500/15 text-mint-500">
          <CheckCircle2 className="size-6" aria-hidden />
        </div>
        <h2 className="text-base font-extrabold">کارمند ساخته شد</h2>
        <p className="text-xs leading-6 text-secondary">
          حساب کاربری با نام کاربری و گذرواژه‌ای که وارد کردید ساخته شد.
        </p>
        <p dir="ltr" className="text-sm font-bold">{createdUsername}</p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => { setCreated(false); setWorkplaceIds([]); }}>ساخت کارمند بعدی</Button>
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
          <FieldLabel htmlFor="username">نام کاربری ورود *</FieldLabel>
          <Input id="username" name="username" dir="ltr" required maxLength={80} autoComplete="off" />
        </div>
        <div>
          <FieldLabel htmlFor="employee_code">کد کارمندی</FieldLabel>
          <Input id="employee_code" name="employee_code" dir="ltr" maxLength={40} />
        </div>
        <div>
          <FieldLabel htmlFor="password">گذرواژه *</FieldLabel>
          <Input id="password" name="password" type="password" dir="ltr" required maxLength={128} autoComplete="new-password" />
        </div>
        <div>
          <FieldLabel htmlFor="password_confirm">تکرار گذرواژه *</FieldLabel>
          <Input id="password_confirm" name="password_confirm" type="password" dir="ltr" required maxLength={128} autoComplete="new-password" />
        </div>
        <div>
          <FieldLabel htmlFor="phone">شماره تماس</FieldLabel>
          <Input id="phone" name="phone" dir="ltr" inputMode="tel" maxLength={30} />
        </div>
        <div>
          <FieldLabel htmlFor="hired_at" hint="میلادی YYYY-MM-DD">تاریخ استخدام</FieldLabel>
          <Input id="hired_at" name="hired_at" type="date" dir="ltr" />
        </div>
        <div className="sm:col-span-2">
          <WorkplaceMultiSelect workplaces={workplaces} selectedIds={workplaceIds} onChange={setWorkplaceIds} />
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
    </form>
  );
}
