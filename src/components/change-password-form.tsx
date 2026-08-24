"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { changePasswordAction } from "@/lib/actions/auth";

export function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      toast("error", "تکرار گذرواژه جدید مطابقت ندارد.");
      return;
    }
    if (next.length < 8) {
      toast("error", "گذرواژه جدید باید حداقل ۸ کاراکتر باشد.");
      return;
    }
    setPending(true);
    const result = await changePasswordAction({ current, next });
    setPending(false);
    if (result.ok) {
      toast("success", "گذرواژه با موفقیت تغییر کرد.");
      setCurrent("");
      setNext("");
      setConfirm("");
      setOpen(false);
    } else {
      toast("error", result.error ?? "خطای نامشخص");
    }
  }

  if (!open) {
    return (
      <Button variant="secondary" size="md" onClick={() => setOpen(true)}>
        <KeyRound className="size-4" aria-hidden /> تغییر گذرواژه
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <FieldLabel htmlFor="cur-pass">گذرواژه فعلی</FieldLabel>
        <Input id="cur-pass" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </div>
      <div>
        <FieldLabel htmlFor="new-pass">گذرواژه جدید (حداقل ۸ کاراکتر)</FieldLabel>
        <Input id="new-pass" type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required />
      </div>
      <div>
        <FieldLabel htmlFor="conf-pass">تکرار گذرواژه جدید</FieldLabel>
        <Input id="conf-pass" type="password" autoComplete="new-password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </div>
      <div className="flex gap-2">
        <Button type="submit" loading={pending} size="md">
          ذخیره
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          انصراف
        </Button>
      </div>
    </form>
  );
}
