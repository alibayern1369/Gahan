"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { reviewLeaveAction, type LeaveBalance, type LeaveRequestRow } from "@/lib/actions/leave";
import { Badge } from "@/components/ui/badge";
import { GlassCard, SectionTitle } from "@/components/ui/card";
import { faNum } from "@/lib/format";
import { dateToJalali } from "@/lib/jalali";
import { JALALI_MONTHS } from "@/lib/jalali";

function formatDateISO(iso: string, tz: string): string {
  const j = dateToJalali(new Date(iso + "T12:00:00Z"), tz);
  return `${faNum(j.jd)} ${JALALI_MONTHS[j.jm - 1]} ${faNum(j.jy)}`;
}

export function AdminLeavePanel({
  requests,
  balances,
  timezone,
  filter,
}: {
  requests: LeaveRequestRow[];
  balances: { profile_id: string; full_name: string; balance: LeaveBalance | null }[];
  timezone: string;
  filter: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [reviewing, setReviewing] = useState<number | null>(null);
  const [note, setNote] = useState("");

  async function review(id: number, action: "approve" | "reject") {
    setReviewing(id);
    const result = await reviewLeaveAction(id, action, note || undefined);
    setReviewing(null);
    setNote("");
    if (result.ok) {
      toast("success", action === "approve" ? "درخواست تأیید شد." : "درخواست رد شد.");
      router.refresh();
    } else {
      toast("error", result.error);
    }
  }

  return (
    <div className="space-y-4">
      <GlassCard className="overflow-hidden">
        <div className="border-b border-[color:var(--border-line)] p-5 pb-3">
          <SectionTitle
            title="موجودی مرخصی کارمندان"
            subtitle="سهمیه سال جاری — روز کاری (بدون تعطیلات رسمی)"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--border-line)] text-right text-[11px] text-secondary">
                <th className="px-4 py-3 font-semibold">کارمند</th>
                <th className="px-4 py-3 font-semibold">استحقاقی</th>
                <th className="px-4 py-3 font-semibold">استعلاجی</th>
                <th className="px-4 py-3 font-semibold">بدون حقوق</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--border-line)]">
              {balances.map((b) => (
                <tr key={b.profile_id}>
                  <td className="px-4 py-3 font-bold">{b.full_name}</td>
                  <td className="px-4 py-3 text-xs">
                    {b.balance ? (
                      <BalanceCell
                        used={b.balance.entitlement_used}
                        remaining={b.balance.entitlement_remaining}
                        allowance={b.balance.entitlement_allowance}
                        exceeded={b.balance.entitlement_exceeded}
                      />
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {b.balance ? (
                      <BalanceCell
                        used={b.balance.sick_used}
                        remaining={b.balance.sick_remaining}
                        allowance={b.balance.sick_allowance}
                        exceeded={b.balance.sick_exceeded}
                      />
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums">
                    {b.balance ? `${faNum(b.balance.unpaid_used)} روز` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <GlassCard className="overflow-hidden">
        <div className="border-b border-[color:var(--border-line)] p-5 pb-3">
          <SectionTitle
            title={`درخواست‌ها${filter === "pending" ? " — در انتظار بررسی" : ""}`}
            subtitle={`${faNum(requests.length)} مورد`}
          />
        </div>
        {requests.length === 0 ? (
          <p className="p-5 text-center text-xs text-faint">درخواستی یافت نشد.</p>
        ) : (
          <ul className="divide-y divide-[color:var(--border-line)]">
            {requests.map((r) => {
              const profile = r.profiles;
              const name = profile ? `${profile.first_name} ${profile.last_name}` : "—";
              return (
                <li key={r.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold">{name}</span>
                        {profile?.employee_code ? (
                          <span className="text-[10px] text-faint">{profile.employee_code}</span>
                        ) : null}
                        <Badge tone={statusTone(r.status)}>{statusFa(r.status)}</Badge>
                        <Badge tone="neutral">{leaveTypeFa(r.leave_type)}</Badge>
                        <Badge tone="neutral">{r.duration_type === "daily" ? "روزانه" : "ساعتی"}</Badge>
                      </div>
                      <p className="mt-1 text-[11px] text-secondary">
                        {formatDateISO(r.start_date, timezone)}
                        {r.duration_type === "daily" && r.end_date !== r.start_date
                          ? ` تا ${formatDateISO(r.end_date, timezone)}`
                          : ""}
                        {r.duration_type === "hourly" && r.start_time
                          ? ` — ${r.start_time.slice(0, 5)} تا ${r.end_time?.slice(0, 5)}`
                          : ""}
                      </p>
                      <p className="mt-2 text-xs leading-6">{r.description}</p>
                      {r.admin_note ? (
                        <p className="mt-1 text-[11px] text-faint">یادداشت مدیر: {r.admin_note}</p>
                      ) : null}
                    </div>
                    {r.status === "pending" ? (
                      <div className="flex w-full flex-col gap-2 sm:w-56">
                        <Textarea
                          rows={2}
                          placeholder="یادداشت (اختیاری)…"
                          value={reviewing === r.id ? note : ""}
                          onChange={(e) => {
                            setReviewing(r.id);
                            setNote(e.target.value);
                          }}
                          className="text-xs"
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            loading={reviewing === r.id}
                            onClick={() => review(r.id, "approve")}
                            className="flex-1"
                          >
                            <Check className="size-3.5" /> تأیید
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            loading={reviewing === r.id}
                            onClick={() => review(r.id, "reject")}
                            className="flex-1 text-rose-500"
                          >
                            <X className="size-3.5" /> رد
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </GlassCard>
    </div>
  );
}

function BalanceCell({
  used,
  remaining,
  allowance,
  exceeded,
}: {
  used: number;
  remaining: number;
  allowance: number;
  exceeded: number;
}) {
  return (
    <div>
      <span className="font-bold tabular-nums">{faNum(remaining)}</span>
      <span className="text-faint"> / {faNum(allowance)} باقی</span>
      <div className="text-[10px] text-faint">مصرف: {faNum(used)} روز</div>
      {exceeded > 0 ? (
        <div className="text-[10px] font-bold text-rose-500">{faNum(exceeded)} روز بیش از سهمیه</div>
      ) : null}
    </div>
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
