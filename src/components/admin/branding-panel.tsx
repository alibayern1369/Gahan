"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImageUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { removeBrandingAction, uploadBrandingAction, triggerCleanupAction } from "@/lib/actions/settings";

export interface BrandingSlot {
  kind: "logo_light" | "logo_dark" | "favicon" | "pwa_icon";
  title: string;
  hint: string;
  accept: string;
  currentUrl: string | null;
}

export function BrandingPanel({ slots }: { slots: BrandingSlot[] }) {
  const [busyKind, setBusyKind] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  async function upload(kind: string, file: File | undefined) {
    if (!file) return;
    setBusyKind(kind);
    const fd = new FormData();
    fd.set("file", file);
    const result = await uploadBrandingAction(kind, fd);
    setBusyKind(null);
    if (result.ok) {
      toast("success", "فایل بارگذاری و جایگزین شد.");
      router.refresh();
    } else {
      toast("error", result.error);
    }
  }

  async function remove(kind: string) {
    setBusyKind(kind);
    const result = await removeBrandingAction(kind);
    setBusyKind(null);
    if (result.ok) {
      toast("success", "به حالت پیش‌فرض گاهان بازگشت.");
      router.refresh();
    } else {
      toast("error", result.error);
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {slots.map((s) => (
        <GlassCard key={s.kind} className="flex items-center gap-4 p-4">
          <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-black/5 dark:bg-white/8">
            <CurrentPreview url={s.currentUrl} kind={s.kind} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">{s.title}</p>
            <p className="mt-1 text-[10px] leading-4 text-faint">{s.hint}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <label className={`glass inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold text-secondary transition-colors hover:text-brand-500 ${busyKind === s.kind ? "opacity-50 pointer-events-none" : ""}`}>
                <ImageUp className="size-3.5" aria-hidden />
                {s.currentUrl ? "جایگزینی" : "بارگذاری"}
                <input
                  type="file"
                  accept={s.accept}
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    void upload(s.kind, f);
                  }}
                />
              </label>
              {s.currentUrl ? (
                <Button size="sm" variant="ghost" onClick={() => remove(s.kind)} disabled={busyKind === s.kind} className="text-rose-500">
                  <Trash2 className="size-3.5" aria-hidden /> حذف
                </Button>
              ) : (
                <Badge tone="neutral">پیش‌فرض</Badge>
              )}
            </div>
          </div>
        </GlassCard>
      ))}
    </div>
  );
}

function CurrentPreview({ url, kind }: { url: string | null; kind: string }) {
  if (!url) {
    return (
      <span className="bg-gradient-to-l from-brand-700 via-brand-500 to-brand-400 bg-clip-text text-sm font-black text-transparent">
        گاهان
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={kind} className="max-h-20 max-w-20 object-contain" />;
}

export function CleanupTriggerButton() {
  const [pending, setPending] = useState(false);
  const { toast } = useToast();

  return (
    <Button
      variant="secondary"
      size="sm"
      loading={pending}
      onClick={async () => {
        setPending(true);
        const r = await triggerCleanupAction();
        setPending(false);
        if (r.ok) {
          toast("success", `پاک‌سازی انجام شد؛ ${r.removed?.toLocaleString("fa-IR") ?? 0} فایل حذف شد.`);
        } else {
          toast("error", r.error ?? "خطای نامشخص");
        }
      }}
    >
      اجرای دستی پاک‌سازی عکس‌ها
    </Button>
  );
}
