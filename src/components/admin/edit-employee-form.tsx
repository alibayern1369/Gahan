"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { updateEmployeeAction } from "@/lib/actions/admin";
import { displayUsername } from "@/lib/username";
import { WorkplaceMultiSelect } from "@/components/admin/workplace-multi-select";

export interface EditableEmployee {
  user_id: string;
  first_name: string;
  last_name: string;
  employee_code: string | null;
  email: string | null;
  phone: string | null;
  hired_at: string | null; // ISO yyyy-mm-dd
  notes: string | null;
  employment_status: string;
  workplace_ids: number[];
  schedule_id: number | null;
}

export function EditEmployeeForm({
  employee,
  workplaces,
  schedules,
}: {
  employee: EditableEmployee;
  workplaces: Array<{ id: number; name: string }>;
  schedules: Array<{ id: number; name: string }>;
}) {
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState(employee.employment_status);
  const [resetPw, setResetPw] = useState(false);
  const [workplaceIds, setWorkplaceIds] = useState<number[]>(employee.workplace_ids);
  const router = useRouter();
  const { toast } = useToast();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const newPassword = String(fd.get("new_password") ?? "");
    const newPasswordConfirm = String(fd.get("new_password_confirm") ?? "");

    if (resetPw) {
      if (!newPassword) {
        toast("error", "گذرواژه جدید را وارد کنید.");
        return;
      }
      if (newPassword !== newPasswordConfirm) {
        toast("error", "گذرواژه و تکرار آن یکسان نیست.");
        return;
      }
    }

    setPending(true);
    const result = await updateEmployeeAction({
      user_id: employee.user_id,
      first_name: String(fd.get("first_name") ?? "").trim(),
      last_name: String(fd.get("last_name") ?? "").trim(),
      employee_code: String(fd.get("employee_code") ?? "").trim(),
      username: String(fd.get("username") ?? "").trim(),
      phone: String(fd.get("phone") ?? "").trim(),
      hired_at: String(fd.get("hired_at") ?? ""),
      notes: String(fd.get("notes") ?? "").trim(),
      workplace_ids: workplaceIds,
      schedule_id: fd.get("schedule_id") ? Number(fd.get("schedule_id")) : null,
      employment_status: status as "active" | "inactive",
      reset_password: resetPw,
      new_password: resetPw ? newPassword : undefined,
    });
    setPending(false);

    if (result.ok) {
      toast("success", resetPw ? "اطلاعات و گذرواژه ذخیره شد." : "اطلاعات کارمند ذخیره شد.");
      setResetPw(false);
      router.refresh();
    } else {
      toast("error", result.error);
    }
  }

  return (
    <form onSubmit={submit} className="glass space-y-4 rounded-3xl p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="e-first">نام *</FieldLabel>
          <Input id="e-first" name="first_name" defaultValue={employee.first_name} required maxLength={80} />
        </div>
        <div>
          <FieldLabel htmlFor="e-last">نام خانوادگی *</FieldLabel>
          <Input id="e-last" name="last_name" defaultValue={employee.last_name} required maxLength={80} />
        </div>
        <div>
          <FieldLabel htmlFor="e-username">نام کاربری *</FieldLabel>
          <Input id="e-username" name="username" dir="ltr" defaultValue={displayUsername(employee.email)} required maxLength={80} />
        </div>
        <div>
          <FieldLabel htmlFor="e-code">کد کارمندی</FieldLabel>
          <Input id="e-code" name="employee_code" dir="ltr" defaultValue={employee.employee_code ?? ""} maxLength={40} />
        </div>
        <div>
          <FieldLabel htmlFor="e-phone">شماره تماس</FieldLabel>
          <Input id="e-phone" name="phone" dir="ltr" defaultValue={employee.phone ?? ""} inputMode="tel" maxLength={30} />
        </div>
        <div>
          <FieldLabel htmlFor="e-hired" hint="میلادی">تاریخ استخدام</FieldLabel>
          <Input id="e-hired" name="hired_at" type="date" dir="ltr" defaultValue={employee.hired_at ?? ""} />
        </div>
        <div className="sm:col-span-2">
          <WorkplaceMultiSelect workplaces={workplaces} selectedIds={workplaceIds} onChange={setWorkplaceIds} />
        </div>
        <div>
          <FieldLabel htmlFor="e-sch">برنامه کاری</FieldLabel>
          <select id="e-sch" name="schedule_id" defaultValue={employee.schedule_id ?? ""} className="glass-input w-full appearance-none rounded-2xl px-4 py-3 text-sm">
            <option value="">— پیش‌فرض سازمان —</option>
            {schedules.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <FieldLabel htmlFor="e-notes">یادداشت</FieldLabel>
        <Textarea id="e-notes" name="notes" defaultValue={employee.notes ?? ""} maxLength={1000} />
      </div>

      <div className="space-y-3 rounded-2xl bg-black/[0.03] p-3.5 dark:bg-white/[0.05]">
        <label className="flex items-center gap-2 text-xs font-semibold">
          <input
            type="checkbox"
            checked={status === "active"}
            onChange={(e) => setStatus(e.target.checked ? "active" : "inactive")}
            className="size-4 accent-[color:var(--color-brand-500)]"
          />
          حساب فعال باشد (غیرفعال = امکان ورود ندارد)
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold">
          <input
            type="checkbox"
            checked={resetPw}
            onChange={(e) => setResetPw(e.target.checked)}
            className="size-4 accent-[color:var(--color-brand-500)]"
          />
          تغییر گذرواژه
        </label>
        {resetPw ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="e-new-password">گذرواژه جدید</FieldLabel>
              <Input id="e-new-password" name="new_password" type="password" dir="ltr" maxLength={128} autoComplete="new-password" />
            </div>
            <div>
              <FieldLabel htmlFor="e-new-password-confirm">تکرار گذرواژه</FieldLabel>
              <Input id="e-new-password-confirm" name="new_password_confirm" type="password" dir="ltr" maxLength={128} autoComplete="new-password" />
            </div>
          </div>
        ) : null}
      </div>

      <Button type="submit" loading={pending}>ذخیره تغییرات</Button>
    </form>
  );
}
