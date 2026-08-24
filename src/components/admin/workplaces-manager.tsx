"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input } from "@/components/ui/input";
import { GlassCard } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { deleteWorkplaceAction, saveWorkplaceAction, toggleWorkplaceAction } from "@/lib/actions/admin";

export interface WorkplaceRow {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  radius_m: number;
  is_active: boolean;
}

const EMPTY = { name: "", latitude: "35.6892", longitude: "51.3890", radius_m: "150" };

export function WorkplacesManager({ workplaces }: { workplaces: WorkplaceRow[] }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<WorkplaceRow | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const result = await saveWorkplaceAction({
      id: editing?.id,
      name: String(fd.get("name") ?? "").trim(),
      latitude: Number(fd.get("latitude")),
      longitude: Number(fd.get("longitude")),
      radius_m: Math.trunc(Number(fd.get("radius_m"))),
      is_active: fd.get("is_active") === "on",
    });
    if (result.ok) {
      toast("success", editing ? "محل کاری به‌روزرسانی شد." : "محل کاری جدید ساخته شد.");
      setEditing(null);
      setShowForm(false);
      router.refresh();
    } else {
      toast("error", result.error);
    }
  }

  async function onToggle(w: WorkplaceRow) {
    const r = await toggleWorkplaceAction(w.id, !w.is_active);
    if (r.ok) {
      toast("success", w.is_active ? "غیرفعال شد." : "فعال شد.");
      router.refresh();
    } else toast("error", r.error);
  }

  async function onDelete(w: WorkplaceRow) {
    if (!window.confirm(`حذف «${w.name}» قطعی است؟ اگر سابقهٔ حضور داشته باشد فقط غیرفعال‌سازی ممکن است.`)) return;
    const r = await deleteWorkplaceAction(w.id);
    if (r.ok) {
      toast("success", "حذف شد.");
      router.refresh();
    } else toast("error", r.error);
  }

  return (
    <div className="space-y-4">
      {!showForm && !editing ? (
        <Button onClick={() => setShowForm(true)} size="md">
          <Plus className="size-4" aria-hidden /> محل کاری جدید
        </Button>
      ) : (
        <GlassCard className="p-5">
          <h3 className="mb-4 text-sm font-bold">{editing ? `ویرایش «${editing.name}»` : "محل کاری جدید"}</h3>
          <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="w-name">نام محل *</FieldLabel>
              <Input id="w-name" name="name" required maxLength={120} defaultValue={editing?.name ?? ""} placeholder="دفتر مرکزی" />
            </div>
            <div>
              <FieldLabel htmlFor="w-radius" hint="متر">شعاع مجاز *</FieldLabel>
              <Input id="w-radius" name="radius_m" type="number" dir="ltr" min={10} max={10000} required defaultValue={editing?.radius_m ?? EMPTY.radius_m} />
            </div>
            <div>
              <FieldLabel htmlFor="w-lat" hint="-90 تا 90">عرض جغرافیایی *</FieldLabel>
              <Input id="w-lat" name="latitude" type="number" step="any" dir="ltr" min={-90} max={90} required defaultValue={editing?.latitude ?? EMPTY.latitude} />
            </div>
            <div>
              <FieldLabel htmlFor="w-lng" hint="-180 تا 180">طول جغرافیایی *</FieldLabel>
              <Input id="w-lng" name="longitude" type="number" step="any" dir="ltr" min={-180} max={180} required defaultValue={editing?.longitude ?? EMPTY.longitude} />
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold sm:col-span-2">
              <input type="checkbox" name="is_active" defaultChecked={editing ? editing.is_active : true} className="size-4 accent-[color:var(--color-brand-500)]" />
              فعال باشد
            </label>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit">ذخیره</Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setShowForm(false);
                  setEditing(null);
                }}
              >
                انصراف
              </Button>
            </div>
          </form>
          <p className="mt-3 text-[11px] text-faint">
            مختصات را از نقشهٔ گوگل یا OSM بگیرید؛ روی نقطهٔ موردنظر کلیک‌راست کنید و «کپی مختصات» را انتخاب نمایید.
          </p>
        </GlassCard>
      )}

      {workplaces.length === 0 && !showForm ? (
        <GlassCard>
          <EmptyState icon={MapPin} title="هنوز محلی تعریف نشده" description="برای ثبت حضور، حداقل یک محل کاری با شعاع مجاز لازم است." />
        </GlassCard>
      ) : (
        <ul className="space-y-3">
          {workplaces.map((w) => (
            <li key={w.id}>
              <GlassCard className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-bold">
                    {w.name}
                    <Badge tone={w.is_active ? "success" : "neutral"} className="mr-2">
                      {w.is_active ? "فعال" : "غیرفعال"}
                    </Badge>
                  </p>
                  <p dir="ltr" className="mt-1 text-[11px] tabular-nums text-secondary text-left">
                    {w.latitude.toFixed(6)}, {w.longitude.toFixed(6)} — R:{w.radius_m}m
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => onToggle(w)}>
                    {w.is_active ? "غیرفعال‌سازی" : "فعال‌سازی"}
                  </Button>
                  <Button size="sm" variant="secondary" aria-label={`ویرایش ${w.name}`} onClick={() => setEditing(w)}>
                    <Pencil className="size-3.5" aria-hidden />
                  </Button>
                  <Button size="sm" variant="ghost" aria-label={`حذف ${w.name}`} onClick={() => onDelete(w)} className="text-rose-500 hover:text-rose-600">
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
