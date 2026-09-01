"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Clock, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input, Textarea } from "@/components/ui/input";
import { JalaliDateField, jalaliFieldToIso } from "@/components/ui/jalali-date-field";
import { useToast } from "@/components/ui/toast";
import { submitLeaveAction, type LeaveBalance } from "@/lib/actions/leave";
import type { LeaveRequestRow } from "@/lib/actions/leave";
import { dateToJalali, JALALI_MONTHS, type JalaliDate } from "@/lib/jalali";
import { faNum } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { GlassCard, SectionTitle } from "@/components/ui/card";

const LEAVE_TYPES = [
  { value: "entitlement", label: "استحقاقی", desc: "از سهمیه سالانه" },
  { value: "sick", label: "استعلاجی", desc: "با ارائه مدارک پزشکی" },
  { value: "unpaid", label: "بدون حقوق", desc: "خارج از سهمیه" },
] as const;

function todayJalali(): JalaliDate {
  return dateToJalali(new Date(), "Asia/Tehran");
}

function formatDateISO(iso: string): string {
  const j = dateToJalali(new Date(iso + "T12:00:00Z"), "Asia/Tehran");
  return `${faNum(j.jd)} ${JALALI_MONTHS[j.jm - 1]} ${faNum(j.jy)}`;
}

export function LeavePanel({
  balance,
  requests,
}: {
  balance: LeaveBalance | null;
  requests: LeaveRequestRow[];
}) {
  const [durationType, setDurationType] = useState<"daily" | "hourly">("daily");
  const [leaveType, setLeaveType] = useState<"sick" | "entitlement" | "unpaid">("entitlement");
  const [startDate, setStartDate] = useState<JalaliDate>(todayJalali);
  const [endDate, setEndDate] = useState<JalaliDate>(todayJalali);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const startISO = jalaliFieldToIso(startDate);
    const endISO = durationType === "daily" ? jalaliFieldToIso(endDate) : startISO;

    setPending(true);
    const result = await submitLeaveAction({
      leave_type: leaveType,
      duration_type: durationType,
      start_date: startISO,
      end_date: endISO,
      start_time: durationType === "hourly" ? String(fd.get("start_time")) : "",
      end_time: durationType === "hourly" ? String(fd.get("end_time")) : "",
      description: String(fd.get("description")),
    });
    setPending(false);
    if (result.ok) {
      toast("success", "درخواست مرخصی ثبت شد و در انتظار تأیید مدیر است.");
      router.refresh();
      (e.target as HTMLFormElement).reset();
      const today = todayJalali();
      setStartDate(today);
      setEndDate(today);
    } else {
      toast("error", result.error);
    }
  }

  return (
    <div className="space-y-4">
      {balance ? (
        <div className="grid grid-cols-2 gap-3">
          <BalanceCard
            title="استحقاقی"
            used={balance.entitlement_used}
            remaining={balance.entitlement_remaining}
            allowance={balance.entitlement_allowance}
            exceeded={balance.entitlement_exceeded}
            color="brand"
          />
          <BalanceCard
            title="استعلاجی"
            used={balance.sick_used}
            remaining={balance.sick_remaining}
            allowance={balance.sick_allowance}
            exceeded={balance.sick_exceeded}
            color="mint"
          />
        </div>
      ) : null}

      <GlassCard className="p-5">
        <SectionTitle title="ثبت درخواست مرخصی" subtitle="پس از ثبت، مدیر درخواست را بررسی می‌کند." />

        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => setDurationType("daily")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-xs font-bold transition-colors ${
              durationType === "daily"
                ? "bg-brand-500/15 text-brand-600 ring-1 ring-brand-500/30 dark:text-brand-300"
                : "glass text-secondary"
            }`}
          >
            <CalendarDays className="size-4" /> روزانه
          </button>
          <button
            type="button"
            onClick={() => setDurationType("hourly")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-xs font-bold transition-colors ${
              durationType === "hourly"
                ? "bg-brand-500/15 text-brand-600 ring-1 ring-brand-500/30 dark:text-brand-300"
                : "glass text-secondary"
            }`}
          >
            <Clock className="size-4" /> ساعتی
          </button>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-2 xs:grid-cols-3 sm:grid-cols-3">
          {LEAVE_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setLeaveType(t.value)}
              className={`min-w-0 rounded-2xl px-2 py-3 text-center transition-colors sm:px-3 ${
                leaveType === t.value
                  ? "bg-brand-500/15 ring-1 ring-brand-500/30"
                  : "glass"
              }`}
            >
              <div className="text-xs font-bold">{t.label}</div>
              <div className="mt-0.5 text-[10px] leading-4 text-faint">{t.desc}</div>
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4">
          {durationType === "daily" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <JalaliDateField id="lv-start" label="تاریخ شروع" value={startDate} onChange={setStartDate} />
              <JalaliDateField id="lv-end" label="تاریخ پایان" value={endDate} onChange={setEndDate} />
            </div>
          ) : (
            <div className="space-y-3">
              <JalaliDateField id="lv-start" label="تاریخ" value={startDate} onChange={setStartDate} />
              <div className="grid grid-cols-2 gap-3">
                <div className="min-w-0">
                  <FieldLabel htmlFor="lv-st">ساعت شروع</FieldLabel>
                  <Input id="lv-st" name="start_time" type="time" dir="ltr" required className="min-w-0" />
                </div>
                <div className="min-w-0">
                  <FieldLabel htmlFor="lv-et">ساعت پایان</FieldLabel>
                  <Input id="lv-et" name="end_time" type="time" dir="ltr" required className="min-w-0" />
                </div>
              </div>
            </div>
          )}
          <div>
            <FieldLabel htmlFor="lv-desc">توضیحات</FieldLabel>
            <Textarea id="lv-desc" name="description" rows={3} required placeholder="دلیل و توضیحات مرخصی…" maxLength={2000} />
          </div>
          <Button type="submit" loading={pending} className="w-full">
            <Send className="size-4" /> ارسال درخواست
          </Button>
        </form>
      </GlassCard>

      <GlassCard className="overflow-hidden">
        <div className="border-b border-[color:var(--border-line)] p-5 pb-3">
          <SectionTitle title="درخواست‌های من" />
        </div>
        {requests.length === 0 ? (
          <p className="p-5 text-center text-xs text-faint">هنوز درخواستی ثبت نکرده‌اید.</p>
        ) : (
          <ul className="divide-y divide-[color:var(--border-line)]">
            {requests.map((r) => (
              <li key={r.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold">{leaveTypeFa(r.leave_type)}</span>
                      <Badge tone={statusTone(r.status)}>{statusFa(r.status)}</Badge>
                      <Badge tone="neutral">{r.duration_type === "daily" ? "روزانه" : "ساعتی"}</Badge>
                    </div>
                    <p className="mt-1 text-[11px] text-secondary">
                      {formatDateISO(r.start_date)}
                      {r.duration_type === "daily" && r.end_date !== r.start_date
                        ? ` تا ${formatDateISO(r.end_date)}`
                        : ""}
                      {r.duration_type === "hourly" && r.start_time
                        ? ` — ${r.start_time?.slice(0, 5)} تا ${r.end_time?.slice(0, 5)}`
                        : ""}
                    </p>
                    <p className="mt-1.5 text-xs leading-5 text-secondary">{r.description}</p>
                    {r.admin_note ? (
                      <p className="mt-1 text-[11px] text-faint">پاسخ مدیر: {r.admin_note}</p>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </div>
  );
}

function BalanceCard({
  title,
  used,
  remaining,
  allowance,
  exceeded,
  color,
}: {
  title: string;
  used: number;
  remaining: number;
  allowance: number;
  exceeded: number;
  color: "brand" | "mint";
}) {
  const pct = allowance > 0 ? Math.min(100, (used / allowance) * 100) : 0;
  return (
    <GlassCard className="p-4">
      <div className="text-[10px] font-semibold text-faint">{title}</div>
      <div className="mt-1 text-lg font-extrabold tabular-nums">
        {faNum(remaining)} <span className="text-xs font-normal text-faint">روز باقی‌مانده</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
        <div
          className={`h-full rounded-full ${color === "brand" ? "bg-brand-500" : "bg-mint-500"} ${exceeded > 0 ? "bg-rose-500" : ""}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-faint">
        <span>مصرف: {faNum(used)} از {faNum(allowance)}</span>
        {exceeded > 0 ? <span className="text-rose-500">{faNum(exceeded)} روز اضافه</span> : null}
      </div>
    </GlassCard>
  );
}

function leaveTypeFa(t: string): string {
  switch (t) {
    case "sick": return "استعلاجی";
    case "entitlement": return "استحقاقی";
    case "unpaid": return "بدون حقوق";
    default: return t;
  }
}

function statusFa(s: string): string {
  switch (s) {
    case "pending": return "در انتظار";
    case "approved": return "تأیید شده";
    case "rejected": return "رد شده";
    default: return s;
  }
}

function statusTone(s: string): "warning" | "success" | "danger" | "neutral" {
  switch (s) {
    case "pending": return "warning";
    case "approved": return "success";
    case "rejected": return "danger";
    default: return "neutral";
  }
}
