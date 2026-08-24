# گاهان | Gāhān

**سامانه هوشمند حضور و غیاب** — A production-ready, mobile-first employee attendance system built for small organizations (~50 employees) on free-tier Supabase + Vercel.

> راهنمای نصب قدم‌به‌قدم برای غیر متخصص‌ها: [SETUP-FA.md](./SETUP-FA.md)

## Overview

گاهان lets employees check in/out **only** when they are inside an allowed GPS radius of their assigned workplace **and** capture a fresh selfie. Every acceptance decision runs server-side inside PostgreSQL (security-definer RPC); client input is never trusted. Attendance selfies are stored in a private bucket and automatically deleted after a configurable retention period (default 30 days) while keeping the attendance records for reporting.

## Stack

| Layer      | Choice |
|------------|--------|
| Framework  | Next.js 15 (App Router) · React 19 · TypeScript strict |
| Styling    | Tailwind CSS v4 · custom Glassmorphism design system · Vazirmatn font |
| Backend    | Supabase: Postgres (+ RLS) · Auth · Storage · pg_cron-ready |
| Validation | Zod on server actions + DB-level constraints |
| Charts     | Hand-rolled SVG (RTL-aware, zero chart libraries) |
| Testing    | Vitest (jalali calendar, geodesy, schedule math) |

## Key Features

- **Server-authoritative attendance** — timestamps from `clock_timestamp()`, distance via SQL Haversine, state machine with row locks + partial unique index (no duplicate check-ins, races impossible).
- **Geofencing** — per-workplace radius, configurable max GPS accuracy, poor-accuracy rejection with friendly Persian guidance.
- **Selfie pipeline** — front camera (`getUserMedia` with file-capture fallback), client-side resize/JPEG re-encode (~100–250 KB target, EXIF stripped by canvas re-encode), private bucket upload under the user's own folder.
- **Anti-abuse signals** — suspicious-event log (low accuracy, out-of-range attempts, impossible travel, rapid patterns) flagged *not* blocked; IP + user-agent captured.
- **Admin suite** — dashboard KPIs & charts, live “today” board, attendance detail with OSM map + signed selfie URLs, employee CRUD (soft deactivation, temp-password reset), workplaces, work schedules, manual corrections with full audit trail, reports (per-employee summary + drill-down) and CSV/XLSX-compatible exports (UTF-8 BOM / SpreadsheetML).
- **Jalali-first UX** — full RTL, Persian digits, native-quality Jalali dates (zero-dependency Borkowski algorithm, verified against ICU), timezone configurable (default `Asia/Tehran`).
- **Branding** — admin-uploaded light/dark logos, favicon and PWA icon stored in a public `branding` bucket (SVG sanitized server-side); polished default گاهان wordmark fallbacks.
- **Photo retention** — daily cleanup job deletes expired/orphaned selfie files from Storage while flagging records with `*_photo_deleted_at`. Runs via Vercel Cron (`vercel.json`) or the bundled Supabase Edge Function + pg_cron option.
- **PWA-friendly** — dynamic web manifest, theme colors, standalone display, safe-area support, cache-free service worker (offline never fakes success).

## Project Layout

```
src/
  app/                    # App Router pages (/login, /app/*, /admin/*, /api/*)
  components/             # UI kit, charts, attendance flow, admin widgets
  lib/
    supabase/             # server / browser / service-role clients, middleware
    actions/              # server actions (auth, attendance, admin, settings)
    jalali.ts geo.ts format.ts schedule-math.ts   # pure domain logic
    settings-server.ts auth.ts audit.ts reports.ts cleanup.ts
supabase/
  migrations/0001..0005   # schema, functions, RLS, storage buckets, retention RPC
  functions/cleanup-selfies/   # optional Edge Function for pg_cron scheduling
  optional/cron-cleanup.sql    # pg_cron template (manual step)
scripts/seed.ts           # demo data (guarded by ALLOW_DEMO_SEED=true)
tests/                    # vitest suites
```

## Development

```bash
cp .env.example .env.local   # fill values from your Supabase project
npm install
npm run dev                  # http://localhost:3000
npm run typecheck            # tsc --noEmit
npm run lint                 # eslint (next/core-web-vitals)
npm test                     # vitest
npm run build                # production build (includes lint+tsc)
npm run db:seed              # demo data — dev only!
```

## Environment Variables

| Variable | Scope | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser-safe | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser-safe | public anon key (RLS-protected) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server-only secret** | auth-admin ops, storage admin, cleanup |
| `CRON_SECRET` | **server-only secret** | protects `/api/cron/cleanup` |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `ALLOW_DEMO_SEED` | script only | demo seeding |

## Database (summary)

`profiles` · `workplaces` · `employee_workplaces` · `work_schedules` · `employee_schedules` · `attendance_sessions` (partial unique index = one open session per person) · `photo_uploads` (ledger enabling orphan GC) · `admin_adjustments` · `audit_logs` · `suspicious_events` · `app_settings` (singleton).

Security-definer RPCs: `submit_attendance`, `validate_attendance_location`, `register_photo_upload`, `report_sessions`, `report_employee_summary`, `dashboard_stats`, `mark_photos_deleted`.

RLS is enabled everywhere: employees read only their own sessions/photos ledger; admins manage; privilege escalation is blocked by trigger; selfies bucket enforces per-user folders; branding bucket is public-read/admin-write.

## Branding

Admin ▸ تنظیمات ▸ برندینگ: upload light/dark logos, favicon and PWA icon (PNG/JPG/WebP/SVG ≤512 KB, favicon ≤256 KB, PWA PNG ≥512×512). Files land in `branding/logos|favicons|icons/`; SVG uploads are sanitized server-side. Manifest, metadata icons, login screen, headers and dashboards pick everything up automatically; without uploads the default «گاهان» wordmark renders.

## Deployment

1. Create a Supabase project → run `supabase/migrations/*.sql` in order (CLI or SQL editor).
2. Deploy to Vercel → set env vars → done. Daily photo cleanup is pre-wired through `vercel.json` (`CRON_SECRET` required).
3. Optional Supabase-native scheduling: deploy `supabase/functions/cleanup-selfies` and run `supabase/optional/cron-cleanup.sql`.

Full beginner walkthrough (Persian): **[SETUP-FA.md](./SETUP-FA.md)**.
