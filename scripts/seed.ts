/**
 * گاهان — Development/demo seed.
 *
 * Usage (NEVER run against a production project):
 *   1) Set in .env.local:
 *      NEXT_PUBLIC_SUPABASE_URL=...
 *      SUPABASE_SERVICE_ROLE_KEY=...
 *      SEED_ADMIN_EMAIL=admin@example.com
 *      SEED_ADMIN_PASSWORD=ChangeMe!123456
 *      ALLOW_DEMO_SEED=true
 *   2) npm run db:seed
 *
 * Creates: 1 admin, 6 employees, 1 workplace, 1 schedule, ~2 weeks of sample
 * attendance (late arrivals, overtime, a missing checkout), and one suspicious
 * event. All demo users share the password Gahan!Demo123 unless overridden.
 */
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY تنظیم نشده‌اند.");
  process.exit(1);
}
if (process.env.ALLOW_DEMO_SEED !== "true") {
  console.error("❌ برای اجرای seed باید ALLOW_DEMO_SEED=true باشد. این اسکریپت فقط برای محیط توسعه است.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@gahan.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Gahan!Admin123";
const EMP_PASSWORD = "Gahan!Demo123";

const EMPLOYEES = [
  { first_name: "سارا", last_name: "محمدی", code: "EMP-001" },
  { first_name: "علی", last_name: "رضایی", code: "EMP-002" },
  { first_name: "نگار", last_name: "کریمی", code: "EMP-003" },
  { first_name: "حسین", last_name: "احمدی", code: "EMP-004" },
  { first_name: "مریم", last_name: "حیدری", code: "EMP-005" },
  { first_name: "امیر", last_name: "موسوی", code: "EMP-006" },
];

function employeeEmail(code: string): string {
  return `${code.toLowerCase().replace(/-/g, "")}@gahan.demo`;
}

async function ensureUser(email: string, password: string, emailConfirm = true): Promise<string> {
  // try find by list (admin API lacks direct lookup by email)
  const { data } = await admin.auth.admin.listUsers({ perPage: 500 });
  const existing = data?.users.find((u) => u.email?.toLowerCase() === email);
  if (existing) return existing.id;

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: emailConfirm,
  });
  if (error || !created.user) throw new Error(`auth user ${email}: ${error?.message}`);
  return created.user.id;
}

async function main() {
  console.log("🌱 شروع seed دادهٔ نمونه…");

  /* ---------- settings singleton exists via migration; update org name ---------- */
  await admin.from("app_settings").upsert({ id: true, organization_name: "شرکت نمونه گاهان" });

  /* ---------- admin ---------- */
  const adminId = await ensureUser(ADMIN_EMAIL, ADMIN_PASSWORD);
  await admin.from("profiles").upsert({
    user_id: adminId,
    role: "admin",
    first_name: "مدیر",
    last_name: "سامانه",
    employee_code: "ADMIN",
    email: ADMIN_EMAIL,
    employment_status: "active",
  });
  console.log(`✔ مدیر ساخته شد: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);

  /* ---------- workplace ---------- */
  let workplaceId: number | undefined;
  const { data: existingWp } = await admin.from("workplaces").select("id").eq("name", "دفتر مرکزی").maybeSingle();
  if (existingWp) {
    workplaceId = existingWp.id;
  } else {
    const { data: wp, error } = await admin
      .from("workplaces")
      .insert({ name: "دفتر مرکزی", latitude: 35.7448, longitude: 51.3753, radius_m: 150, is_active: true })
      .select("id")
      .single();
    if (error) throw error;
    workplaceId = wp.id;
  }
  console.log("✔ محل کاری «دفتر مرکزی» آماده است.");

  /* ---------- schedule ---------- */
  let scheduleId: number | undefined;
  const { data: existingSch } = await admin.from("work_schedules").select("id").eq("name", "شیفت اداری صبح").maybeSingle();
  if (existingSch) {
    scheduleId = existingSch.id;
  } else {
    const { data: sch, error } = await admin
      .from("work_schedules")
      .insert({
        name: "شیفت اداری صبح",
        working_days: [0, 1, 2, 3, 4],
        start_time: "09:00:00",
        end_time: "17:00:00",
        grace_minutes: 10,
        expected_hours: 8,
      })
      .select("id")
      .single();
    if (error) throw error;
    scheduleId = sch.id;
  }
  console.log("✔ برنامه کاری «شیفت اداری صبح» آماده است.");

  /* ---------- employees ---------- */
  const employeeIds: string[] = [];
  for (let i = 0; i < EMPLOYEES.length; i += 1) {
    const e = EMPLOYEES[i];
    const email = employeeEmail(e.code);
    const uid = await ensureUser(email, EMP_PASSWORD);
    await admin.from("profiles").upsert({
      user_id: uid,
      role: "employee",
      first_name: e.first_name,
      last_name: e.last_name,
      employee_code: e.code,
      email,
      hired_at: "2024-01-01",
      employment_status: "active",
    });
    await admin.from("employee_workplaces").upsert({ profile_id: uid, workplace_id: workplaceId!, is_primary: true });
    await admin.from("employee_schedules").upsert({ profile_id: uid, schedule_id: scheduleId! });
    employeeIds.push(uid);
    console.log(`✔ کارمند: ${e.first_name} ${e.last_name} <${email}>`);
  }

  /* ---------- sample attendance (past 14 days, Persian workweek Sat..Wed) ---------- */
  const now = Date.now();
  let inserted = 0;

  for (let dayBack = 14; dayBack >= 0; dayBack -= 1) {
    const g = new Date(now - dayBack * 86_400_000);
    const wdEn = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tehran", weekday: "short" }).format(g);
    const map: Record<string, number> = { Sat: 0, Sun: 1, Mon: 2, Tue: 3, Wed: 4, Thu: 5, Fri: 6 };
    const wd = map[wdEn] ?? 0;
    if (wd > 4) continue;

    const tehranDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(g);

    for (let idx = 0; idx < employeeIds.length; idx += 1) {
      const empIdx = (idx + dayBack) % employeeIds.length;
      if ((dayBack + idx) % 11 === 5) continue;

      const lateMin = [0, 0, 12, 0, 25, 8][empIdx] ?? 0;
      const overtimeMin = empIdx === 1 ? 45 : 0;
      const checkinLocalMin = 9 * 60 + lateMin + (idx % 3) * 2;
      const workedMin = 8 * 60 + overtimeMin - ((dayBack * 7) % 13);

      const checkinHour = Math.floor(checkinLocalMin / 60);
      const checkinMinute = checkinLocalMin % 60;
      const [y, m, d] = tehranDate.split("-").map(Number);
      const checkinAt = new Date(Date.UTC(y, m - 1, d, checkinHour - 3, checkinMinute - 30, 0));
      if (Number.isNaN(checkinAt.getTime())) throw new Error(`checkinAt invalid for ${tehranDate}`);
      const isToday = dayBack === 0;
      // today: leave the session open for a couple of employees (still on site)
      const openSession = isToday && empIdx % 2 === 0;
      const checkoutAt = openSession ? null : new Date(checkinAt.getTime() + Math.max(240, workedMin) * 60_000);

      const { error } = await admin.from("attendance_sessions").insert({
        profile_id: employeeIds[empIdx],
        workplace_id: workplaceId,
        checkin_at: checkinAt.toISOString(),
        checkout_at: checkoutAt ? checkoutAt.toISOString() : null,
        checkin_latitude: 35.7448 + (Math.random() - 0.5) * 0.0008,
        checkin_longitude: 51.3753 + (Math.random() - 0.5) * 0.0008,
        checkin_accuracy_m: 12 + empIdx * 3,
        checkin_distance_m: Math.round(15 + empIdx * 9),
        checkin_allowed_radius_m: 150,
        checkout_latitude: checkoutAt ? 35.7448 : null,
        checkout_longitude: checkoutAt ? 51.3753 : null,
        checkout_accuracy_m: checkoutAt ? 18 : null,
        checkout_distance_m: checkoutAt ? 40 : null,
        checkout_allowed_radius_m: checkoutAt ? 150 : null,
        late_minutes: lateMin,
        early_leave_minutes: 0,
        worked_minutes: checkoutAt ? Math.max(240, workedMin) : null,
        overtime_minutes: overtimeMin,
        checkin_ip: "203.0.113.10",
        checkin_user_agent: "SeedScript/1.0 (demo data)",
        checkout_ip: checkoutAt ? "203.0.113.10" : null,
        checkout_user_agent: checkoutAt ? "SeedScript/1.0 (demo data)" : null,
      });
      if (error && !error.message.includes("duplicate")) throw error;
      if (!error) inserted += 1;
    }
  }

  // one suspicious sample
  await admin.from("suspicious_events").insert({
    profile_id: employeeIds[2],
    type: "low_accuracy",
    details: { accuracy: 480, max_allowed: 100, note: "نمونهٔ دمو" },
  });

  console.log(`✔ ${inserted.toLocaleString("fa-IR")} رکورد حضور نمونه ساخته شد.`);
  console.log("\n✅ Seed کامل شد.");
  console.log(`   ورود مدیر:   ${ADMIN_EMAIL}`);
  console.log(`   گذرواژه‌ها در خروجی بالا آمده‌اند. حتماً بعد از تست، این کاربران را حذف یا غیرفعال کنید.`);
}

main().catch((err) => {
  console.error("❌ خطای seed:", err.message);
  process.exit(1);
});
