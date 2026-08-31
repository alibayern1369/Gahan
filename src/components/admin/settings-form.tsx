"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { updateSettingsAction } from "@/lib/actions/settings";
import { PERSIAN_WEEKDAYS } from "@/lib/jalali";

export interface SettingsValues {
  organization_name: string;
  application_name: string;
  tagline: string;
  timezone: string;
  default_radius_m: number;
  max_gps_accuracy_m: number;
  selfie_retention_days: number;
  workweek_days: number[];
  default_work_hours: number;
  grace_minutes: number;
  annual_sick_days: number;
  annual_entitlement_days: number;
}

export function SettingsForm({ initial }: { initial: SettingsValues }) {
  const [days, setDays] = useState<number[]>(initial.workweek_days);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (days.length === 0) {
      toast("error", "حداقل یک روز کاری انتخاب کنید.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    setPending(true);
    const result = await updateSettingsAction({
      organization_name: String(fd.get("organization_name") ?? "").trim(),
      application_name: String(fd.get("application_name") ?? "").trim(),
      tagline: String(fd.get("tagline") ?? "").trim(),
      timezone: String(fd.get("timezone") ?? "").trim(),
      default_radius_m: Number(fd.get("default_radius_m")),
      max_gps_accuracy_m: Number(fd.get("max_gps_accuracy_m")),
      selfie_retention_days: Number(fd.get("selfie_retention_days")),
      default_work_hours: Number(fd.get("default_work_hours")),
      grace_minutes: Number(fd.get("grace_minutes")),
      workweek_days: days,
      annual_sick_days: Number(fd.get("annual_sick_days")),
      annual_entitlement_days: Number(fd.get("annual_entitlement_days")),
    });
    setPending(false);
    if (result.ok) {
      toast("success", "تنظیمات ذخیره شد.");
      router.refresh();
    } else {
      toast("error", result.error);
    }
  }

  return (
    <form onSubmit={submit} className="glass space-y-5 rounded-3xl p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="st-org">نام سازمان</FieldLabel>
          <Input id="st-org" name="organization_name" defaultValue={initial.organization_name} required maxLength={120} />
        </div>
        <div>
          <FieldLabel htmlFor="st-app" hint="پیش‌فرض: گاهان">نام برنامه</FieldLabel>
          <Input id="st-app" name="application_name" defaultValue={initial.application_name} required maxLength={60} />
        </div>
        <div className="sm:col-span-2">
          <FieldLabel htmlFor="st-tag">شعار / توضیح کوتاه</FieldLabel>
          <Input id="st-tag" name="tagline" defaultValue={initial.tagline} required maxLength={160} />
        </div>
        <div>
          <FieldLabel htmlFor="st-tz" hint="مثال: Asia/Tehran">منطقه زمانی</FieldLabel>
          <Input id="st-tz" name="timezone" dir="ltr" defaultValue={initial.timezone} required maxLength={60} />
        </div>
        <div>
          <FieldLabel htmlFor="st-radius" hint="متر">شعاع پیش‌فرض محل کار</FieldLabel>
          <Input id="st-radius" name="default_radius_m" type="number" dir="ltr" min={10} max={10000} defaultValue={initial.default_radius_m} />
        </div>
        <div>
          <FieldLabel htmlFor="st-acc" hint="متر">حداکثر دقت قابل‌قبول GPS</FieldLabel>
          <Input id="st-acc" name="max_gps_accuracy_m" type="number" dir="ltr" min={10} max={5000} defaultValue={initial.max_gps_accuracy_m} />
          <p className="mt-1 text-[10px] text-faint">اگر دقت گوشی بدتر از این مقدار باشد، ثبت حضور رد می‌شود.</p>
        </div>
        <div>
          <FieldLabel htmlFor="st-ret" hint="روز — پیش‌فرض ۳۰">مدت نگهداری عکس‌های سلفی</FieldLabel>
          <Input id="st-ret" name="selfie_retention_days" type="number" dir="ltr" min={7} max={365} defaultValue={initial.selfie_retention_days} />
        </div>
        <div>
          <FieldLabel htmlFor="st-hours" hint="ساعت در روز">ساعات کار پیش‌فرض</FieldLabel>
          <Input id="st-hours" name="default_work_hours" type="number" step="0.5" dir="ltr" min={1} max={16} defaultValue={initial.default_work_hours} />
        </div>
        <div>
          <FieldLabel htmlFor="st-grace" hint="دقیقه">گرِیس تأخیر پیش‌فرض</FieldLabel>
          <Input id="st-grace" name="grace_minutes" type="number" dir="ltr" min={0} max={240} defaultValue={initial.grace_minutes} />
        </div>
        <div>
          <FieldLabel htmlFor="st-sick" hint="روز در سال">مرخصی استعلاجی مجاز</FieldLabel>
          <Input id="st-sick" name="annual_sick_days" type="number" dir="ltr" min={0} max={365} defaultValue={initial.annual_sick_days} />
        </div>
        <div>
          <FieldLabel htmlFor="st-ent" hint="روز در سال">مرخصی استحقاقی مجاز</FieldLabel>
          <Input id="st-ent" name="annual_entitlement_days" type="number" dir="ltr" min={0} max={365} defaultValue={initial.annual_entitlement_days} />
        </div>
      </div>

      <fieldset>
        <legend className="mb-2 text-xs font-semibold text-secondary">هفتهٔ کاری پیش‌فرض</legend>
        <div className="flex flex-wrap gap-2">
          {PERSIAN_WEEKDAYS.map((d, i) => (
            <label key={d} className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-black/[0.03] px-3 py-2 text-xs font-semibold dark:bg-white/[0.06]">
              <input
                type="checkbox"
                checked={days.includes(i)}
                onChange={(e) => setDays((prev) => (e.target.checked ? [...prev, i].sort() : prev.filter((x) => x !== i)))}
                className="size-3.5 accent-[color:var(--color-brand-500)]"
              />
              {d}
            </label>
          ))}
        </div>
      </fieldset>

      <Button type="submit" loading={pending}>
        <Save className="size-4" aria-hidden /> ذخیره تنظیمات
      </Button>
    </form>
  );
}
