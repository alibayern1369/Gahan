"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FieldLabel, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { JalaliDateTimeField, type JalaliDateTimeValue } from "./jalali-datetime-field";
import { adjustAttendanceAction } from "@/lib/actions/attendance-admin";
import { jalaliToGregorianDate } from "@/lib/jalali";

type Tab = "checkout" | "checkin" | "note" | "excuse";

export function AttendanceAdjustForm({
  sessionId,
  profileId,
  timezone,
  defaultJalali,
}: {
  sessionId: number;
  profileId: string;
  timezone: string;
  defaultJalali: { jy: number; jm: number; jd: number };
}) {
  const [tab, setTab] = useState<Tab>("checkout");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [when, setWhen] = useState<JalaliDateTimeValue>({
    ...defaultJalali,
    hh: 17,
    mm: 0,
  });
  const [note, setNote] = useState("");
  const router = useRouter();
  const { toast } = useToast();

  async function submit() {
    setPending(true);
    let result;

    if (tab === "checkout") {
      result = await adjustAttendanceAction({ action: "add_checkout", session_id: sessionId, ...when, reason: reason || undefined });
    } else if (tab === "checkin") {
      result = await adjustAttendanceAction({ action: "adjust_checkin", session_id: sessionId, ...when, reason: reason || undefined });
    } else if (tab === "note") {
      result = await adjustAttendanceAction({ action: "add_note", session_id: sessionId, note });
    } else {
      result = await adjustAttendanceAction({
        action: "excuse_absence",
        profile_id: profileId,
        jy: when.jy,
        jm: when.jm,
        jd: when.jd,
        reason,
      });
    }

    setPending(false);
    if (result.ok) {
      toast("success", "اصلاح با موفقیت ثبت و در گزارش لاگ شد.");
      router.refresh();
    } else {
      toast("error", result.error);
    }
  }

  const tabs: { key: Tab; label: string; disabled?: boolean }[] = [
    { key: "checkout", label: "ثبت خروج فراموش‌شده" },
    { key: "checkin", label: "اصلاح ورود" },
    { key: "note", label: "افزودن یادداشت" },
    { key: "excuse", label: "غیبت موجه" },
  ];

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="نوع اصلاح" className="flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full px-3.5 py-2 text-[11px] font-bold transition-colors ${
              tab === t.key
                ? "bg-brand-500/15 text-brand-600 ring-1 ring-inset ring-brand-500/30 dark:text-brand-300"
                : "glass text-secondary hover:text-brand-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "checkout" || tab === "checkin" ? (
        <>
          <JalaliDateTimeField label={tab === "checkout" ? "زمان خروج (شمسی)" : "زمان ورود اصلاح‌شده (شمسی)"} value={when} onChange={setWhen} />
          <div>
            <FieldLabel htmlFor="adj-reason">دلیل اصلاح (ثبت در لاگ)</FieldLabel>
            <Textarea id="adj-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="مثلاً: فراموشی ثبت خروج — تأیید سرپرست" />
          </div>
        </>
      ) : null}

      {tab === "note" ? (
        <div>
          <FieldLabel htmlFor="adj-note">یادداشت روی رکورد</FieldLabel>
          <Textarea id="adj-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="یادداشت داخلی برای این رکورد…" />
        </div>
      ) : null}

      {tab === "excuse" ? (
        <>
          <p className="rounded-xl bg-sky-500/10 px-3.5 py-2.5 text-[11px] leading-6 text-secondary">
            غیبتِ موجه به‌صورت یک رکورد مدیریتی برای تاریخ انتخابی ثبت می‌شود و در لاگ ممیزی باقی می‌ماند.
          </p>
          <JalaliDateTimeField label="تاریخ غیبت موجه" value={{ ...when }} onChange={(v) => setWhen(v)} />
          <div>
            <FieldLabel htmlFor="adj-excuse">توضیح</FieldLabel>
            <Textarea id="adj-excuse" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} required />
          </div>
        </>
      ) : null}

      <Button onClick={submit} loading={pending}>
        ثبت اصلاح
      </Button>

      <GregorianFootnote {...when} timezone={timezone} />
    </div>
  );
}

function GregorianFootnote(props: { jy: number; jm: number; jd: number; timezone: string }) {
  try {
    const g = jalaliToGregorianDate(props.jy, props.jm, props.jd);
    return (
      <p dir="ltr" className="text-[10px] text-faint">
        Selected Gregorian date: {g.toISOString().slice(0, 10)} ({props.timezone})
      </p>
    );
  } catch {
    return null;
  }
}
