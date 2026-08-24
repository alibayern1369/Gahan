"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input } from "@/components/ui/input";
import { GlassCard } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { deleteScheduleAction, saveScheduleAction } from "@/lib/actions/admin";
import { PERSIAN_WEEKDAYS } from "@/lib/jalali";
import { faNum } from "@/lib/format";

export interface ScheduleRow {
  id: number;
  name: string;
  working_days: number[];
  start_time: string | null;
  end_time: string | null;
  grace_minutes: number;
  expected_hours: number | null;
}

export function SchedulesManager({ schedules }: { schedules: ScheduleRow[] }) {
  const [editing, setEditing] = useState<ScheduleRow | null>(null);
  const [showForm, setShowForm] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const days = PERSIAN_WEEKDAYS.map((_, i) => i).filter((i) => fd.get(`day-${i}`) === "on");
    if (days.length === 0) {
      toast("error", "حداقل یک روز کاری انتخاب کنید.");
      return;
    }
    const startTime = String(fd.get("start_time") ?? "");
    const endTime = String(fd.get("end_time") ?? "");
    const result = await saveScheduleAction({
      id: editing?.id,
      name: String(fd.get("name") ?? "").trim(),
      working_days: days,
      start_time: startTime || null,
      end_time: endTime || null,
      grace_minutes: Math.trunc(Number(fd.get("grace_minutes") ?? 10)),
      expected_hours: fd.get("expected_hours") ? Number(fd.get("expected_hours")) : null,
    });
    if (result.ok) {
      toast("success", editing ? "برنامه به‌روزرسانی شد." : "برنامه کاری ساخته شد.");
      setEditing(null);
      setShowForm(false);
      router.refresh();
    } else {
      toast("error", result.error);
    }
  }

  async function onDelete(s: ScheduleRow) {
    if (!window.confirm(`حذف برنامهٔ «${s.name}»؟`)) return;
    const r = await deleteScheduleAction(s.id);
    if (r.ok) {
      toast("success", "حذف شد.");
      router.refresh();
    } else toast("error", r.error);
  }

  return (
    <div className="space-y-4">
      {!showForm && !editing ? (
        <Button onClick={() => setShowForm(true)}>
          <Plus className="size-4" aria-hidden /> برنامهٔ کاری جدید
        </Button>
      ) : (
        <GlassCard className="p-5">
          <h3 className="mb-4 text-sm font-bold">{editing ? `ویرایش «${editing.name}»` : "برنامهٔ جدید"}</h3>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="s-name">نام برنامه *</FieldLabel>
                <Input id="s-name" name="name" required maxLength={120} defaultValue={editing?.name ?? ""} placeholder="شیفت اداری صبح" />
              </div>
              <div>
                <FieldLabel htmlFor="s-grace" hint="دقیقه">گرِیس (تحمل تأخیر)</FieldLabel>
                <Input id="s-grace" name="grace_minutes" type="number" dir="ltr" min={0} max={240} defaultValue={editing?.grace_minutes ?? 10} />
              </div>
              <div>
                <FieldLabel htmlFor="s-start">ساعت شروع</FieldLabel>
                <Input id="s-start" name="start_time" type="time" dir="ltr" defaultValue={editing?.start_time?.slice(0, 5) ?? "09:00"} />
              </div>
              <div>
                <FieldLabel htmlFor="s-end">ساعت پایان</FieldLabel>
                <Input id="s-end" name="end_time" type="time" dir="ltr" defaultValue={editing?.end_time?.slice(0, 5) ?? "17:00"} />
              </div>
              <div>
                <FieldLabel htmlFor="s-hours" hint="ساعت">ساعات کار موردانتظار روزانه</FieldLabel>
                <Input id="s-hours" name="expected_hours" type="number" step="0.5" dir="ltr" min={1} max={16} defaultValue={editing?.expected_hours ?? 8} />
              </div>
            </div>

            <fieldset>
              <legend className="mb-2 text-xs font-semibold text-secondary">روزهای کاری</legend>
              <div className="flex flex-wrap gap-2">
                {PERSIAN_WEEKDAYS.map((d, i) => (
                  <label
                    key={d}
                    className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-black/[0.03] px-3 py-2 text-xs font-semibold dark:bg-white/[0.06]"
                  >
                    <input type="checkbox" name={`day-${i}`} defaultChecked={editing ? editing.working_days.includes(i) : i <= 3} className="size-3.5 accent-[color:var(--color-brand-500)]" />
                    {d}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex gap-2">
              <Button type="submit">ذخیره</Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setEditing(null);
                  setShowForm(false);
                }}
              >
                انصراف
              </Button>
            </div>
          </form>
        </GlassCard>
      )}

      {schedules.length === 0 && !showForm ? (
        <GlassCard>
          <EmptyState icon={CalendarClock} title="برنامه‌ای تعریف نشده" description="کارمندان بدون برنامه از هفتهٔ کاری پیش‌فرض تنظیمات پیروی می‌کنند." />
        </GlassCard>
      ) : (
        <ul className="space-y-3">
          {schedules.map((s) => (
            <li key={s.id}>
              <GlassCard className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-bold">{s.name}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-secondary">
                    <Badge tone="brand">
                      {faNum((s.start_time ?? "?").slice(0, 5))} تا {faNum((s.end_time ?? "?").slice(0, 5))}
                    </Badge>
                    <span>{s.working_days.map((d) => PERSIAN_WEEKDAYS[d]).join("، ")}</span>
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="secondary" aria-label={`ویرایش ${s.name}`} onClick={() => setEditing(s)}>
                    <Pencil className="size-3.5" aria-hidden />
                  </Button>
                  <Button size="sm" variant="ghost" aria-label={`حذف ${s.name}`} onClick={() => onDelete(s)} className="text-rose-500 hover:text-rose-600">
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                </div>
              </GlassCard>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
