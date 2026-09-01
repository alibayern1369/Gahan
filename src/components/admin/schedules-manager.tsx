"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input } from "@/components/ui/input";
import { GlassCard } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { deleteScheduleAction, saveScheduleAction } from "@/lib/actions/admin";
import { JALALI_MONTHS, PERSIAN_WEEKDAYS, dateToJalali, jalaliToGregorianDate } from "@/lib/jalali";
import { ROTATION_CYCLE_LABELS } from "@/lib/schedule-math";
import { faNum } from "@/lib/format";

export interface ScheduleRow {
  id: number;
  name: string;
  schedule_type: "fixed" | "rotational";
  working_days: number[];
  start_time: string | null;
  end_time: string | null;
  grace_minutes: number;
  expected_hours: number | null;
  rotation_anchor_date: string | null;
  morning_start_time: string | null;
  morning_end_time: string | null;
  evening_start_time: string | null;
  evening_end_time: string | null;
}

type ScheduleFormType = "fixed" | "rotational";

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

function jalaliToIsoDate(jy: number, jm: number, jd: number): string {
  const g = jalaliToGregorianDate(jy, jm, jd);
  return `${g.getUTCFullYear()}-${pad2(g.getUTCMonth() + 1)}-${pad2(g.getUTCDate())}`;
}

function isoToJalali(iso: string | null): { jy: number; jm: number; jd: number } {
  if (!iso) {
    const now = new Date();
    return dateToJalali(now, "Asia/Tehran");
  }
  const [y, m, d] = iso.split("-").map(Number);
  return dateToJalali(new Date(Date.UTC(y, m - 1, d)), "Asia/Tehran");
}

function sliceTime(t: string | null, fallback: string) {
  return t?.slice(0, 5) ?? fallback;
}

export function SchedulesManager({ schedules }: { schedules: ScheduleRow[] }) {
  const [editing, setEditing] = useState<ScheduleRow | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<ScheduleFormType>("fixed");
  const [anchorJalali, setAnchorJalali] = useState(() => isoToJalali(null));
  const router = useRouter();
  const { toast } = useToast();

  const anchorPreview = useMemo(() => {
    try {
      return jalaliToIsoDate(anchorJalali.jy, anchorJalali.jm, anchorJalali.jd);
    } catch {
      return "";
    }
  }, [anchorJalali]);

  function openCreate() {
    setEditing(null);
    setFormType("fixed");
    setAnchorJalali(isoToJalali(null));
    setShowForm(true);
  }

  function openEdit(s: ScheduleRow) {
    setEditing(s);
    setFormType(s.schedule_type);
    setAnchorJalali(isoToJalali(s.rotation_anchor_date));
    setShowForm(true);
  }

  function closeForm() {
    setEditing(null);
    setShowForm(false);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") ?? "").trim();
    const grace = Math.trunc(Number(fd.get("grace_minutes") ?? 10));

    if (formType === "fixed") {
      const days = PERSIAN_WEEKDAYS.map((_, i) => i).filter((i) => fd.get(`day-${i}`) === "on");
      if (days.length === 0) {
        toast("error", "حداقل یک روز کاری انتخاب کنید.");
        return;
      }
      const startTime = String(fd.get("start_time") ?? "");
      const endTime = String(fd.get("end_time") ?? "");
      const result = await saveScheduleAction({
        id: editing?.id,
        schedule_type: "fixed",
        name,
        working_days: days,
        start_time: startTime || null,
        end_time: endTime || null,
        grace_minutes: grace,
        expected_hours: fd.get("expected_hours") ? Number(fd.get("expected_hours")) : null,
      });
      if (result.ok) {
        toast("success", editing ? "برنامه به‌روزرسانی شد." : "برنامه کاری ساخته شد.");
        closeForm();
        router.refresh();
      } else {
        toast("error", result.error);
      }
      return;
    }

    let rotationAnchor: string;
    try {
      rotationAnchor = jalaliToIsoDate(anchorJalali.jy, anchorJalali.jm, anchorJalali.jd);
    } catch {
      toast("error", "تاریخ شروع چرخش معتبر نیست.");
      return;
    }

    const result = await saveScheduleAction({
      id: editing?.id,
      schedule_type: "rotational",
      name,
      grace_minutes: grace,
      rotation_anchor_date: rotationAnchor,
      morning_start_time: String(fd.get("morning_start_time") ?? ""),
      morning_end_time: String(fd.get("morning_end_time") ?? ""),
      evening_start_time: String(fd.get("evening_start_time") ?? ""),
      evening_end_time: String(fd.get("evening_end_time") ?? ""),
    });

    if (result.ok) {
      toast("success", editing ? "شیفت چرخشی به‌روزرسانی شد." : "شیفت چرخشی ساخته شد.");
      closeForm();
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
        <Button onClick={openCreate}>
          <Plus className="size-4" aria-hidden /> برنامهٔ کاری جدید
        </Button>
      ) : (
        <GlassCard className="p-5">
          <h3 className="mb-4 text-sm font-bold">{editing ? `ویرایش «${editing.name}»` : "برنامهٔ جدید"}</h3>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="s-name">نام برنامه *</FieldLabel>
                <Input
                  id="s-name"
                  name="name"
                  required
                  maxLength={120}
                  defaultValue={editing?.name ?? ""}
                  placeholder={formType === "rotational" ? "شیفت آقای نظری" : "شیفت اداری صبح"}
                />
              </div>
              <div>
                <FieldLabel htmlFor="s-type">نوع برنامه</FieldLabel>
                <select
                  id="s-type"
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as ScheduleFormType)}
                  className="glass-input w-full appearance-none rounded-2xl px-4 py-3 text-sm"
                >
                  <option value="fixed">ثابت (هفتگی معمولی)</option>
                  <option value="rotational">چرخشی فرودگاه (صبح / عصر / آف)</option>
                </select>
              </div>
              <div>
                <FieldLabel htmlFor="s-grace" hint="دقیقه">گرِیس (تحمل تأخیر)</FieldLabel>
                <Input
                  id="s-grace"
                  name="grace_minutes"
                  type="number"
                  dir="ltr"
                  min={0}
                  max={240}
                  defaultValue={editing?.grace_minutes ?? 10}
                />
              </div>
            </div>

            {formType === "fixed" ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor="s-start">ساعت شروع</FieldLabel>
                    <Input
                      id="s-start"
                      name="start_time"
                      type="time"
                      dir="ltr"
                      defaultValue={sliceTime(editing?.start_time ?? null, "09:00")}
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor="s-end">ساعت پایان</FieldLabel>
                    <Input
                      id="s-end"
                      name="end_time"
                      type="time"
                      dir="ltr"
                      defaultValue={sliceTime(editing?.end_time ?? null, "17:00")}
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor="s-hours" hint="ساعت">ساعات کار موردانتظار روزانه</FieldLabel>
                    <Input
                      id="s-hours"
                      name="expected_hours"
                      type="number"
                      step="0.5"
                      dir="ltr"
                      min={1}
                      max={16}
                      defaultValue={editing?.expected_hours ?? 8}
                    />
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
                        <input
                          type="checkbox"
                          name={`day-${i}`}
                          defaultChecked={editing ? editing.working_days.includes(i) : i <= 3}
                          className="size-3.5 accent-[color:var(--color-brand-500)]"
                        />
                        {d}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </>
            ) : (
              <>
                <div className="rounded-2xl border border-[color:var(--border-line)] bg-black/[0.02] p-4 text-xs leading-relaxed text-secondary dark:bg-white/[0.03]">
                  <p className="font-semibold text-primary">چرخش ۳روزه گروهی</p>
                  <p className="mt-1">
                    روز ۱: {ROTATION_CYCLE_LABELS[0]} — روز ۲: {ROTATION_CYCLE_LABELS[1]} — روز ۳:{" "}
                    {ROTATION_CYCLE_LABELS[2]}. پنج‌شنبه، جمعه و تعطیلات رسمی در این مدل لحاظ نمی‌شوند.
                    مرخصی فقط از روزهای صبح و عصر کم می‌شود. حضور در روز آف = کل ساعات اضافه‌کار.
                  </p>
                </div>

                <fieldset className="rounded-2xl border border-[color:var(--border-line)] p-3">
                  <legend className="px-1.5 text-[11px] font-semibold text-secondary">
                    تاریخ شروع چرخش (روز اول = شیفت صبح) *
                  </legend>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="min-w-20">
                      <span className="mb-1 block text-center text-[10px] text-faint">سال</span>
                      <Input
                        type="number"
                        dir="ltr"
                        min={1300}
                        max={1500}
                        value={anchorJalali.jy}
                        onChange={(e) => setAnchorJalali((p) => ({ ...p, jy: Number(e.target.value) }))}
                      />
                    </label>
                    <label className="min-w-28 flex-1">
                      <span className="mb-1 block text-center text-[10px] text-faint">ماه</span>
                      <select
                        value={anchorJalali.jm}
                        onChange={(e) => setAnchorJalali((p) => ({ ...p, jm: Number(e.target.value) }))}
                        className="glass-input w-full rounded-xl px-2 py-2.5 text-xs"
                      >
                        {JALALI_MONTHS.map((m, i) => (
                          <option key={m} value={i + 1}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="min-w-16">
                      <span className="mb-1 block text-center text-[10px] text-faint">روز</span>
                      <Input
                        type="number"
                        dir="ltr"
                        min={1}
                        max={31}
                        value={anchorJalali.jd}
                        onChange={(e) => setAnchorJalali((p) => ({ ...p, jd: Number(e.target.value) }))}
                      />
                    </label>
                  </div>
                  {anchorPreview ? (
                    <p className="mt-2 text-[10px] text-faint" dir="ltr">
                      میلادی: {anchorPreview}
                    </p>
                  ) : null}
                </fieldset>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-3 rounded-2xl bg-black/[0.02] p-3 dark:bg-white/[0.03]">
                    <p className="text-xs font-bold">{ROTATION_CYCLE_LABELS[0]}</p>
                    <div>
                      <FieldLabel htmlFor="m-start">شروع</FieldLabel>
                      <Input
                        id="m-start"
                        name="morning_start_time"
                        type="time"
                        dir="ltr"
                        required
                        defaultValue={sliceTime(editing?.morning_start_time ?? null, "06:00")}
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor="m-end">پایان</FieldLabel>
                      <Input
                        id="m-end"
                        name="morning_end_time"
                        type="time"
                        dir="ltr"
                        required
                        defaultValue={sliceTime(editing?.morning_end_time ?? null, "14:00")}
                      />
                    </div>
                  </div>
                  <div className="space-y-3 rounded-2xl bg-black/[0.02] p-3 dark:bg-white/[0.03]">
                    <p className="text-xs font-bold">{ROTATION_CYCLE_LABELS[1]}</p>
                    <div>
                      <FieldLabel htmlFor="e-start">شروع</FieldLabel>
                      <Input
                        id="e-start"
                        name="evening_start_time"
                        type="time"
                        dir="ltr"
                        required
                        defaultValue={sliceTime(editing?.evening_start_time ?? null, "14:00")}
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor="e-end">پایان</FieldLabel>
                      <Input
                        id="e-end"
                        name="evening_end_time"
                        type="time"
                        dir="ltr"
                        required
                        defaultValue={sliceTime(editing?.evening_end_time ?? null, "23:00")}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            <div className="flex gap-2">
              <Button type="submit">ذخیره</Button>
              <Button type="button" variant="ghost" onClick={closeForm}>
                انصراف
              </Button>
            </div>
          </form>
        </GlassCard>
      )}

      {schedules.length === 0 && !showForm ? (
        <GlassCard>
          <EmptyState
            icon={CalendarClock}
            title="برنامه‌ای تعریف نشده"
            description="کارمندان بدون برنامه از هفتهٔ کاری پیش‌فرض تنظیمات پیروی می‌کنند."
          />
        </GlassCard>
      ) : (
        <ul className="space-y-3">
          {schedules.map((s) => (
            <li key={s.id}>
              <GlassCard className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-bold">
                    {s.name}
                    {s.schedule_type === "rotational" ? (
                      <Badge tone="warning" className="mr-2">
                        چرخشی
                      </Badge>
                    ) : null}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-secondary">
                    {s.schedule_type === "rotational" ? (
                      <>
                        <Badge tone="brand">
                          صبح {faNum(sliceTime(s.morning_start_time, "?"))}–{faNum(sliceTime(s.morning_end_time, "?"))}
                        </Badge>
                        <Badge tone="brand">
                          عصر {faNum(sliceTime(s.evening_start_time, "?"))}–{faNum(sliceTime(s.evening_end_time, "?"))}
                        </Badge>
                        <span>چرخش: {ROTATION_CYCLE_LABELS.join(" → ")}</span>
                      </>
                    ) : (
                      <>
                        <Badge tone="brand">
                          {faNum(sliceTime(s.start_time, "?"))} تا {faNum(sliceTime(s.end_time, "?"))}
                        </Badge>
                        <span>{s.working_days.map((d) => PERSIAN_WEEKDAYS[d]).join("، ")}</span>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="secondary" aria-label={`ویرایش ${s.name}`} onClick={() => openEdit(s)}>
                    <Pencil className="size-3.5" aria-hidden />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`حذف ${s.name}`}
                    onClick={() => onDelete(s)}
                    className="text-rose-500 hover:text-rose-600"
                  >
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
