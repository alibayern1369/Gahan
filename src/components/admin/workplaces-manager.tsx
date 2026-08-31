"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Crosshair, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input } from "@/components/ui/input";
import { GlassCard } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { deleteWorkplaceAction, saveWorkplaceAction, toggleWorkplaceAction } from "@/lib/actions/admin";
import type { LocationValue } from "@/components/admin/location-picker";

const LocationPicker = dynamic(
  () => import("@/components/admin/location-picker").then((m) => m.LocationPicker),
  { ssr: false, loading: () => <div className="h-72 animate-pulse rounded-2xl bg-black/5 dark:bg-white/10" /> }
);

export interface WorkplaceRow {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  radius_m: number;
  is_active: boolean;
}

const DEFAULT_LOCATION: LocationValue = {
  latitude: 35.6892,
  longitude: 51.389,
  radiusM: 150,
};

export function WorkplacesManager({ workplaces }: { workplaces: WorkplaceRow[] }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<WorkplaceRow | null>(null);
  const [location, setLocation] = useState<LocationValue>(DEFAULT_LOCATION);
  const [locating, setLocating] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  function openCreate() {
    setEditing(null);
    setLocation(DEFAULT_LOCATION);
    setShowForm(true);
  }

  function openEdit(w: WorkplaceRow) {
    setEditing(w);
    setLocation({ latitude: w.latitude, longitude: w.longitude, radiusM: w.radius_m });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
  }

  async function useMyLocation() {
    if (!navigator.geolocation) {
      toast("error", "مرورگر شما از GPS پشتیبانی نمی‌کند.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          radiusM: location.radiusM,
        });
        setLocating(false);
        toast("success", "موقعیت فعلی شما روی نقشه قرار گرفت.");
      },
      () => {
        setLocating(false);
        toast("error", "دسترسی به موقعیت مکانی داده نشد.");
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const result = await saveWorkplaceAction({
      id: editing?.id,
      name: String(fd.get("name") ?? "").trim(),
      latitude: location.latitude,
      longitude: location.longitude,
      radius_m: Math.trunc(Number(fd.get("radius_m"))),
      is_active: fd.get("is_active") === "on",
    });
    if (result.ok) {
      toast("success", editing ? "محل کاری به‌روزرسانی شد." : "محل کاری جدید ساخته شد.");
      closeForm();
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
        <Button onClick={openCreate} size="md">
          <Plus className="size-4" aria-hidden /> محل کاری جدید
        </Button>
      ) : (
        <GlassCard className="p-5">
          <h3 className="mb-4 text-sm font-bold">{editing ? `ویرایش «${editing.name}»` : "محل کاری جدید"}</h3>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="w-name">نام محل *</FieldLabel>
                <Input
                  id="w-name"
                  name="name"
                  required
                  maxLength={120}
                  defaultValue={editing?.name ?? ""}
                  placeholder="فرودگاه، سالن اداری، درب خروج…"
                />
              </div>
              <div>
                <FieldLabel htmlFor="w-radius" hint="متر">شعاع مجاز *</FieldLabel>
                <Input
                  id="w-radius"
                  name="radius_m"
                  type="number"
                  dir="ltr"
                  min={10}
                  max={10000}
                  required
                  defaultValue={editing?.radius_m ?? DEFAULT_LOCATION.radiusM}
                  onChange={(e) => setLocation((prev) => ({ ...prev, radiusM: Math.trunc(Number(e.target.value)) || prev.radiusM }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <FieldLabel>موقعیت روی نقشه *</FieldLabel>
                <Button type="button" size="sm" variant="secondary" loading={locating} onClick={useMyLocation}>
                  <Crosshair className="size-3.5" aria-hidden /> موقعیت من
                </Button>
              </div>
              <LocationPicker value={location} onChange={setLocation} />
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <FieldLabel htmlFor="w-lat" hint="-90 تا 90">عرض جغرافیایی</FieldLabel>
                  <Input
                    id="w-lat"
                    type="number"
                    step="any"
                    dir="ltr"
                    min={-90}
                    max={90}
                    value={location.latitude}
                    onChange={(e) =>
                      setLocation((prev) => ({ ...prev, latitude: Number(e.target.value) }))
                    }
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="w-lng" hint="-180 تا 180">طول جغرافیایی</FieldLabel>
                  <Input
                    id="w-lng"
                    type="number"
                    step="any"
                    dir="ltr"
                    min={-180}
                    max={180}
                    value={location.longitude}
                    onChange={(e) =>
                      setLocation((prev) => ({ ...prev, longitude: Number(e.target.value) }))
                    }
                  />
                </div>
              </div>
              <p className="text-[11px] text-faint">
                روی نقشه کلیک کنید یا نشانگر را بکشید. دایرهٔ بنفش محدودهٔ مجاز حضور را نشان می‌دهد.
              </p>
            </div>

            <label className="flex items-center gap-2 text-xs font-semibold">
              <input
                type="checkbox"
                name="is_active"
                defaultChecked={editing ? editing.is_active : true}
                className="size-4 accent-[color:var(--color-brand-500)]"
              />
              فعال باشد
            </label>

            <div className="flex gap-2">
              <Button type="submit">ذخیره</Button>
              <Button type="button" variant="ghost" onClick={closeForm}>
                انصراف
              </Button>
            </div>
          </form>
        </GlassCard>
      )}

      {workplaces.length === 0 && !showForm ? (
        <GlassCard>
          <EmptyState
            icon={MapPin}
            title="هنوز محلی تعریف نشده"
            description="برای هر بخش (فرودگاه، سالن اداری، درب خروج و …) یک محل با نام و موقعیت GPS بسازید."
          />
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
                  <Button size="sm" variant="secondary" aria-label={`ویرایش ${w.name}`} onClick={() => openEdit(w)}>
                    <Pencil className="size-3.5" aria-hidden />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`حذف ${w.name}`}
                    onClick={() => onDelete(w)}
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
