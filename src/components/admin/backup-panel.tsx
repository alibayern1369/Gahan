"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, RefreshCw, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  exportBackupAction,
  importBackupAction,
  resetSystemAction,
  syncHolidaysAction,
  type BackupPayload,
} from "@/lib/actions/backup";
import { GlassCard, SectionTitle } from "@/components/ui/card";
import { faNum } from "@/lib/format";

export function BackupPanel() {
  const [pending, setPending] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { toast } = useToast();

  async function handleExport() {
    setPending("export");
    const result = await exportBackupAction();
    setPending(null);
    if (!result.ok) {
      toast("error", result.error);
      return;
    }
    const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gahan-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("success", "بکاپ با موفقیت دانلود شد.");
  }

  async function handleImport(file: File) {
    setPending("import");
    try {
      const text = await file.text();
      const payload = JSON.parse(text) as BackupPayload;
      const result = await importBackupAction(payload, { resetFirst: true });
      if (result.ok) {
        toast("success", "بکاپ با موفقیت بازیابی شد.");
        router.refresh();
      } else {
        toast("error", result.error);
      }
    } catch {
      toast("error", "فایل بکاپ نامعتبر است.");
    }
    setPending(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleReset() {
    setPending("reset");
    const result = await resetSystemAction(confirmReset);
    setPending(null);
    if (result.ok) {
      toast("success", "سامانه با موفقیت صفر شد.");
      setConfirmReset("");
      router.refresh();
    } else {
      toast("error", result.error);
    }
  }

  async function handleSyncHolidays() {
    setPending("holidays");
    const result = await syncHolidaysAction();
    setPending(null);
    if (result.ok) {
      toast("success", `${faNum(result.count)} تعطیل رسمی به‌روزرسانی شد.`);
    } else {
      toast("error", result.error);
    }
  }

  return (
    <div className="space-y-4">
      <GlassCard className="p-5">
        <SectionTitle
          title="تقویم تعطیلات رسمی ایران"
          subtitle="تعطیلات از API رسمی دریافت و در سامانه ذخیره می‌شود. روزهای تعطیل در محاسبه غیبت و مرخصی لحاظ می‌شوند."
        />
        <Button onClick={handleSyncHolidays} loading={pending === "holidays"} variant="ghost">
          <RefreshCw className="size-4" /> به‌روزرسانی تعطیلات
        </Button>
      </GlassCard>

      <GlassCard className="p-5">
        <SectionTitle
          title="بکاپ کامل سامانه"
          subtitle="تمام جداول، کاربران و فایل‌های سلفی/برندینگ در یک فایل JSON ذخیره می‌شود."
        />
        <div className="flex flex-wrap gap-3">
          <Button onClick={handleExport} loading={pending === "export"}>
            <Download className="size-4" /> دانلود بکاپ
          </Button>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              id="backup-file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImport(f);
              }}
            />
            <Button
              variant="ghost"
              loading={pending === "import"}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="size-4" /> بازیابی از بکاپ
            </Button>
          </div>
        </div>
        <p className="mt-3 text-[10px] leading-5 text-faint">
          بازیابی ابتدا تمام داده‌های فعلی را پاک می‌کند و سپس بکاپ را وارد می‌کند. حساب مدیر فعلی حفظ می‌شود.
        </p>
      </GlassCard>

      <GlassCard className="border-rose-500/20 p-5">
        <SectionTitle
          title="صفر کردن سامانه"
          subtitle="تمام کارمندان، حضور و غیاب، مرخصی‌ها و داده‌ها حذف می‌شوند. فقط حساب مدیر فعلی باقی می‌ماند."
        />
        <div className="space-y-3">
          <div>
            <FieldLabel htmlFor="reset-confirm" hint="برای تأیید عبارت RESET-CONFIRM را وارد کنید">
              تأیید حذف
            </FieldLabel>
            <Input
              id="reset-confirm"
              value={confirmReset}
              onChange={(e) => setConfirmReset(e.target.value)}
              placeholder="RESET-CONFIRM"
              dir="ltr"
              className="max-w-xs"
            />
          </div>
          <Button
            variant="ghost"
            onClick={handleReset}
            loading={pending === "reset"}
            disabled={confirmReset !== "RESET-CONFIRM"}
            className="text-rose-500"
          >
            <Trash2 className="size-4" /> صفر کردن کامل سامانه
          </Button>
        </div>
      </GlassCard>
    </div>
  );
}
