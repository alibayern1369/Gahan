-- ============================================================
-- گاهان | Migration 0001 — Core schema
-- Tables, constraints, indexes, triggers, default settings row.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- profiles ----------
create table if not exists public.profiles (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  role              text not null default 'employee' check (role in ('admin', 'employee')),
  first_name        text not null check (char_length(first_name) between 1 and 80),
  last_name         text not null check (char_length(last_name) between 1 and 80),
  employee_code     text unique,
  email             text,
  phone             text,
  avatar_path       text,
  employment_status text not null default 'active' check (employment_status in ('active', 'inactive')),
  hired_at          date,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_profiles_status on public.profiles (employment_status);

-- ---------- workplaces ----------
create table if not exists public.workplaces (
  id          bigserial primary key,
  name        text not null check (char_length(name) between 1 and 120),
  latitude    double precision not null check (abs(latitude) <= 90),
  longitude   double precision not null check (abs(longitude) <= 180),
  radius_m    integer not null default 150 check (radius_m between 10 and 10000),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- employee ↔ workplace ----------
create table if not exists public.employee_workplaces (
  profile_id   uuid not null references public.profiles (user_id) on delete cascade,
  workplace_id bigint not null references public.workplaces (id) on delete cascade,
  is_primary   boolean not null default false,
  primary key (profile_id, workplace_id)
);

create index if not exists idx_emp_workplaces_workplace on public.employee_workplaces (workplace_id);

-- ---------- work schedules ----------
create table if not exists public.work_schedules (
  id             bigserial primary key,
  name           text not null check (char_length(name) between 1 and 120),
  -- Persian weekday index: 0=شنبه … 6=جمعه
  working_days   integer[] not null default '{0,1,2,3,4}' check (array_length(working_days, 1) between 1 and 7),
  start_time     time,
  end_time       time,
  grace_minutes  integer not null default 10 check (grace_minutes between 0 and 240),
  expected_hours numeric(4, 1) check (expected_hours between 1 and 16),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.employee_schedules (
  profile_id  uuid primary key references public.profiles (user_id) on delete cascade,
  schedule_id bigint not null references public.work_schedules (id) on delete cascade
);

create index if not exists idx_emp_schedules_schedule on public.employee_schedules (schedule_id);

-- ---------- attendance sessions ----------
create table if not exists public.attendance_sessions (
  id                         bigserial primary key,
  profile_id                 uuid not null references public.profiles (user_id) on delete cascade,
  workplace_id               bigint references public.workplaces (id),
  checkin_at                 timestamptz not null,
  checkout_at                timestamptz,

  checkin_latitude           double precision,
  checkin_longitude          double precision,
  checkin_accuracy_m         double precision,
  checkin_distance_m         double precision,
  checkin_allowed_radius_m   integer,

  checkout_latitude          double precision,
  checkout_longitude         double precision,
  checkout_accuracy_m        double precision,
  checkout_distance_m        double precision,
  checkout_allowed_radius_m  integer,

  checkin_photo_path         text,
  checkout_photo_path        text,
  checkin_photo_deleted_at   timestamptz,
  checkout_photo_deleted_at  timestamptz,

  late_minutes               integer not null default 0 check (late_minutes >= 0),
  early_leave_minutes        integer not null default 0 check (early_leave_minutes >= 0),
  worked_minutes             integer check (worked_minutes >= 0),
  overtime_minutes           integer not null default 0 check (overtime_minutes >= 0),

  checkin_ip                 inet,
  checkin_user_agent         text,
  checkout_ip                inet,
  checkout_user_agent        text,

  has_manual_adjustment      boolean not null default false,
  note                       text,

  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create index if not exists idx_sessions_profile_time on public.attendance_sessions (profile_id, checkin_at desc);
create index if not exists idx_sessions_checkin on public.attendance_sessions (checkin_at);
create index if not exists idx_sessions_checkout on public.attendance_sessions (checkout_at);
-- Hard guarantee against duplicate open sessions (double check-in race protection).
create unique index if not exists uq_open_session
  on public.attendance_sessions (profile_id)
  where checkout_at is null;

-- ---------- photo upload ledger (enables orphan GC + retention GC) ----------
create table if not exists public.photo_uploads (
  id          uuid primary key default gen_random_uuid(),
  path        text not null unique,
  profile_id  uuid not null references public.profiles (user_id) on delete cascade,
  created_at  timestamptz not null default now(),
  attached_at timestamptz
);

create index if not exists idx_photo_uploads_created on public.photo_uploads (created_at);
create index if not exists idx_photo_uploads_unattached on public.photo_uploads (created_at)
  where attached_at is null;

-- ---------- admin adjustments ----------
create table if not exists public.admin_adjustments (
  id         bigserial primary key,
  session_id bigint references public.attendance_sessions (id) on delete set null,
  admin_id   uuid not null references public.profiles (user_id),
  action     text not null check (action in ('add_checkout', 'adjust_checkin', 'adjust_checkout', 'excuse_absence', 'add_note')),
  old_value  jsonb,
  new_value  jsonb,
  reason     text,
  created_at timestamptz not null default now()
);

create index if not exists idx_adjustments_session on public.admin_adjustments (session_id);

-- ---------- audit logs ----------
create table if not exists public.audit_logs (
  id         bigserial primary key,
  actor_id   uuid references public.profiles (user_id) on delete set null,
  action     text not null,
  entity     text not null,
  entity_id  text,
  old_value  jsonb,
  new_value  jsonb,
  meta       jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_created on public.audit_logs (created_at desc);

-- ---------- suspicious events ----------
create table if not exists public.suspicious_events (
  id         bigserial primary key,
  profile_id uuid not null references public.profiles (user_id) on delete cascade,
  session_id bigint references public.attendance_sessions (id) on delete set null,
  type       text not null check (type in ('low_accuracy', 'out_of_range_attempt', 'impossible_jump', 'rapid_pattern', 'repeated_failures')),
  details    jsonb not null default '{}'::jsonb,
  resolved   boolean not null default false,
  resolved_by uuid references public.profiles (user_id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_suspicious_open on public.suspicious_events (resolved, created_at desc);
create index if not exists idx_suspicious_recent on public.suspicious_events (profile_id, type, created_at desc);

-- ---------- application settings (singleton) ----------
create table if not exists public.app_settings (
  id                    boolean primary key default true check (id),
  organization_name     text not null default 'سازمان من',
  application_name      text not null default 'گاهان',
  tagline               text not null default 'سامانه هوشمند حضور و غیاب',
  timezone              text not null default 'Asia/Tehran',
  default_radius_m      integer not null default 150 check (default_radius_m between 10 and 10000),
  max_gps_accuracy_m    integer not null default 100 check (max_gps_accuracy_m between 10 and 5000),
  selfie_retention_days integer not null default 30 check (selfie_retention_days between 7 and 365),
  workweek_days         integer[] not null default '{0,1,2,3,4}',
  default_work_hours    numeric(4, 1) not null default 8 check (default_work_hours between 1 and 16),
  grace_minutes         integer not null default 10 check (grace_minutes between 0 and 240),
  logo_light_path       text,
  logo_dark_path        text,
  favicon_path          text,
  pwa_icon_path         text,
  theme_color           text not null default '#5d47e4',
  updated_at            timestamptz not null default now()
);

insert into public.app_settings (id) values (true) on conflict (id) do nothing;

-- ---------- updated_at touch trigger ----------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_profiles on public.profiles;
create trigger trg_touch_profiles before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_touch_workplaces on public.workplaces;
create trigger trg_touch_workplaces before update on public.workplaces
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_touch_sessions on public.attendance_sessions;
create trigger trg_touch_sessions before update on public.attendance_sessions
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_touch_schedules on public.work_schedules;
create trigger trg_touch_schedules before update on public.work_schedules
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_touch_settings on public.app_settings;
create trigger trg_touch_settings before update on public.app_settings
  for each row execute function public.touch_updated_at();
