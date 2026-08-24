-- ============================================================
-- گاهان | Migration 0003 — Row Level Security
-- Defense in depth: even a leaked anon key cannot read other
-- employees' data. All policies assume the helper functions
-- from migration 0002 (is_admin etc.).
-- ============================================================

alter table public.profiles             enable row level security;
alter table public.workplaces           enable row level security;
alter table public.employee_workplaces  enable row level security;
alter table public.work_schedules       enable row level security;
alter table public.employee_schedules   enable row level security;
alter table public.attendance_sessions  enable row level security;
alter table public.photo_uploads        enable row level security;
alter table public.admin_adjustments    enable row level security;
alter table public.audit_logs           enable row level security;
alter table public.suspicious_events    enable row level security;
alter table public.app_settings         enable row level security;

-- force RLS even for table owner (except migrations run as postgres)
-- keep default; SECURITY DEFINER functions bypass via definer rights.

-- ---------- profiles ----------
create policy "profiles: read own or admin"
on public.profiles for select to authenticated
using (user_id = auth.uid() or public.is_admin());

create policy "profiles: admin insert"
on public.profiles for insert to authenticated
with check (public.is_admin());

create policy "profiles: update own or admin"
on public.profiles for update to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

-- no delete policy → soft deletion only

-- prevent privilege escalation by non-admins
create or replace function public.guard_profile_update()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    if new.role is distinct from old.role
       or new.employment_status is distinct from old.employment_status then
      raise exception 'تغییر نقش یا وضعیت اشتغال فقط توسط مدیر مجاز است';
    end if;
    new.user_id := old.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_profile on public.profiles;
create trigger trg_guard_profile before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------- workplaces ----------
create policy "workplaces: read authenticated"
on public.workplaces for select to authenticated
using (true);

create policy "workplaces: admin write"
on public.workplaces for insert to authenticated
with check (public.is_admin());

create policy "workplaces: admin update"
on public.workplaces for update to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "workplaces: admin delete"
on public.workplaces for delete to authenticated
using (public.is_admin());

-- ---------- employee ↔ workplace ----------
create policy "emp_workplaces: read own or admin"
on public.employee_workplaces for select to authenticated
using (profile_id = auth.uid() or public.is_admin());

create policy "emp_workplaces: admin write"
on public.employee_workplaces for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ---------- work schedules ----------
create policy "schedules: read authenticated"
on public.work_schedules for select to authenticated
using (true);

create policy "schedules: admin write"
on public.work_schedules for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ---------- employee schedules ----------
create policy "emp_schedules: read own or admin"
on public.employee_schedules for select to authenticated
using (profile_id = auth.uid() or public.is_admin());

create policy "emp_schedules: admin write"
on public.employee_schedules for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ---------- attendance sessions ----------
-- Employees see ONLY their own sessions. Admins see everything.
-- Inserts/updates happen exclusively through submit_attendance (security definer).
create policy "sessions: read own or admin"
on public.attendance_sessions for select to authenticated
using (profile_id = auth.uid() or public.is_admin());

create policy "sessions: admin correct"
on public.attendance_sessions for update to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ---------- photo upload ledger ----------
create policy "photo_uploads: read own or admin"
on public.photo_uploads for select to authenticated
using (profile_id = auth.uid() or public.is_admin());
-- insert/update handled by register_photo_upload / submit_attendance (definer)

-- ---------- admin adjustments ----------
create policy "adjustments: admin read"
on public.admin_adjustments for select to authenticated
using (public.is_admin());

create policy "adjustments: admin write"
on public.admin_adjustments for insert to authenticated
with check (public.is_admin());

-- ---------- audit logs ----------
create policy "audit: admin read"
on public.audit_logs for select to authenticated
using (public.is_admin());

-- ---------- suspicious events ----------
create policy "suspicious: admin read"
on public.suspicious_events for select to authenticated
using (public.is_admin());

create policy "suspicious: admin resolve"
on public.suspicious_events for update to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ---------- app settings ----------
create policy "settings: read authenticated"
on public.app_settings for select to authenticated
using (true);

create policy "settings: admin update"
on public.app_settings for update to authenticated
using (public.is_admin())
with check (public.is_admin());
