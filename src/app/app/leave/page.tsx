import { CalendarHeart } from "lucide-react";
import { LeavePanel } from "@/components/leave/leave-panel";
import { getLeaveBalance, getMyLeaveRequests } from "@/lib/actions/leave";
import { syncIranHolidaysToDb } from "@/lib/iran-holidays";

export const dynamic = "force-dynamic";

export default async function LeavePage() {
  // ensure holidays are synced on first visit
  await syncIranHolidaysToDb().catch(() => undefined);

  const [balance, requests] = await Promise.all([getLeaveBalance(), getMyLeaveRequests()]);

  return (
    <>
      <div className="mb-5 flex items-center gap-3">
        <CalendarHeart className="size-6 text-brand-500" aria-hidden />
        <div>
          <h1 className="text-xl font-extrabold">مرخصی</h1>
          <p className="text-xs text-secondary">ثبت و پیگیری درخواست‌های مرخصی</p>
        </div>
      </div>
      <LeavePanel balance={balance} requests={requests} />
    </>
  );
}
