import "server-only";
import { jalaliToGregorianDate } from "@/lib/jalali";

/** Fixed national holidays (Jalali month/day). Religious holidays come from API. */
const FIXED_HOLIDAYS: { jm: number; jd: number; title: string }[] = [
  { jm: 1, jd: 1, title: "عید نوروز" },
  { jm: 1, jd: 2, title: "عید نوروز" },
  { jm: 1, jd: 3, title: "عید نوروز" },
  { jm: 1, jd: 4, title: "عید نوروز" },
  { jm: 1, jd: 12, title: "روز جمهوری اسلامی" },
  { jm: 1, jd: 13, title: "روز طبیعت" },
  { jm: 3, jd: 14, title: "رحلت امام خمینی" },
  { jm: 3, jd: 15, title: "قیام ۱۵ خرداد" },
  { jm: 11, jd: 22, title: "پیروزی انقلاب اسلامی" },
  { jm: 12, jd: 29, title: "ملی شدن صنعت نفت" },
];

export interface HolidayEntry {
  date: string;
  title: string;
  is_holiday: boolean;
  jalali_year: number;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function fixedHolidaysForYear(jy: number): HolidayEntry[] {
  return FIXED_HOLIDAYS.map((h) => {
    const g = jalaliToGregorianDate(jy, h.jm, h.jd);
    const date = `${g.getUTCFullYear()}-${pad(g.getUTCMonth() + 1)}-${pad(g.getUTCDate())}`;
    return { date, title: h.title, is_holiday: true, jalali_year: jy };
  });
}

/** Fetch holidays from holidayapi.ir and merge with fixed national holidays. */
export async function fetchIranHolidays(jy: number): Promise<HolidayEntry[]> {
  const fixed = fixedHolidaysForYear(jy);
  const map = new Map<string, HolidayEntry>();
  for (const h of fixed) map.set(h.date, h);

  try {
    const res = await fetch(`https://holidayapi.ir/jalali/${jy}`, {
      next: { revalidate: 86400 },
    });
    if (res.ok) {
      const data = (await res.json()) as {
        holidays?: { date: string; description: string; is_holiday?: boolean }[];
      };
      for (const item of data.holidays ?? []) {
        const date = item.date?.slice(0, 10);
        if (!date) continue;
        map.set(date, {
          date,
          title: item.description || "تعطیل رسمی",
          is_holiday: item.is_holiday !== false,
          jalali_year: jy,
        });
      }
    }
  } catch (e) {
    console.warn("[iran-holidays] API fetch failed for", jy, e);
  }

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/** Sync holidays for current and next Jalali year into the database. */
export async function syncIranHolidaysToDb(): Promise<number> {
  const { getServiceClient } = await import("@/lib/supabase/service");
  const { dateToJalali } = await import("@/lib/jalali");
  const { getSettings } = await import("@/lib/settings-server");

  const settings = await getSettings();
  const now = new Date();
  const jy = dateToJalali(now, settings.timezone).jy;

  const all: HolidayEntry[] = [];
  for (const year of [jy, jy + 1]) {
    const holidays = await fetchIranHolidays(year);
    all.push(...holidays);
  }

  const service = getServiceClient();

  for (const h of all) {
    const { error } = await service.from("iran_holidays").upsert(
      {
        holiday_date: h.date,
        title: h.title,
        is_holiday: h.is_holiday,
        jalali_year: h.jalali_year,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "holiday_date" }
    );
    if (error) {
      console.error("[syncIranHolidays] upsert", error.message);
    }
  }

  return all.length;
}
