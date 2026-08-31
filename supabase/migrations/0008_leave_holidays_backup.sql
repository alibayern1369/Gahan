-- ============================================================
-- گاهان | Migration 0008 — Leave management, Iranian holidays,
--          backup support, leave-aware reports
-- ============================================================

-- ---------- app_settings: leave allowances ----------
alter table public.app_settings
  add column if not exists annual_sick_days integer not null default 14
    check (annual_sick_days between 0 and 365),
  add column if not exists annual_entitlement_days integer not null default 26
    check (annual_entitlement_days between 0 and 365);

-- ---------- Iranian holidays cache ----------
create table if not exists public.iran_holidays (
  id          bigserial primary key,
  holiday_date date not null unique,
  title       text not null,
  is_holiday  boolean not null default true,
  jalali_year integer,
  fetched_at  timestamptz not null default now()
);

create index if not exists idx_iran_holidays_date on public.iran_holidays (holiday_date);

-- ---------- leave requests ----------
create table if not exists public.leave_requests (
  id              bigserial primary key,
  profile_id      uuid not null references public.profiles (user_id) on delete cascade,
  leave_type      text not null check (leave_type in ('sick', 'entitlement', 'unpaid')),
  duration_type   text not null check (duration_type in ('daily', 'hourly')),
  start_date      date not null,
  end_date        date not null,
  start_time      time,
  end_time        time,
  description     text not null check (char_length(trim(description)) between 1 and 2000),
  status          text not null default 'pending'
                    check (status in ('pending', 'approved', 'rejected')),
  admin_note      text,
  reviewed_by     uuid references public.profiles (user_id),
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (end_date >= start_date),
  check (
    (duration_type = 'daily' and start_time is null and end_time is null)
    or (duration_type = 'hourly' and start_date = end_date and start_time is not null and end_time is not null)
  )
);

create index if not exists idx_leave_requests_profile on public.leave_requests (profile_id);
create index if not exists idx_leave_requests_status on public.leave_requests (status);
create index if not exists idx_leave_requests_dates on public.leave_requests (start_date, end_date);

-- ---------- helpers ----------
create or replace function public.is_iranian_holiday(p_date date)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.iran_holidays h
    where h.holiday_date = p_date and h.is_holiday = true
  );
$$;

create or replace function public.is_working_day(p_date date, p_working_days integer[])
returns boolean
language sql stable
as $$
  select
    ((extract(dow from p_date)::int + 1) % 7) = any (p_working_days)
    and not public.is_iranian_holiday(p_date);
$$;

create or replace function public.leave_days_count(p_start date, p_end date, p_working_days integer[])
returns numeric
language plpgsql stable security definer
set search_path = public
as $$
declare
  d date;
  cnt numeric := 0;
begin
  for d in select generate_series(p_start, p_end, interval '1 day')::date loop
    if public.is_working_day(d, p_working_days) then
      cnt := cnt + 1;
    end if;
  end loop;
  return cnt;
end;
$$;

create or replace function public.leave_hours_count(p_start time, p_end time)
returns numeric
language sql immutable
as $$
  select greatest(0, extract(epoch from (p_end - p_start)) / 3600.0);
$$;

-- ---------- leave balance ----------
create or replace function public.leave_balance(p_profile uuid, p_year integer default null)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_year integer := coalesce(p_year, extract(year from (now() at time zone public.app_timezone()))::int);
  v_sick_allowance integer;
  v_ent_allowance integer;
  v_sick_used numeric := 0;
  v_ent_used numeric := 0;
  v_unpaid_used numeric := 0;
  v_ww integer[] := public.app_workweek();
  rec record;
  v_days numeric;
  v_hours numeric;
begin
  if auth.uid() is distinct from p_profile and not public.is_admin() then
    raise insufficient_privilege;
  end if;

  select annual_sick_days, annual_entitlement_days
    into v_sick_allowance, v_ent_allowance
    from public.app_settings where id limit 1;

  for rec in
    select lr.*
    from public.leave_requests lr
    where lr.profile_id = p_profile
      and lr.status = 'approved'
      and extract(year from lr.start_date) = v_year
  loop
    if rec.duration_type = 'daily' then
      v_days := public.leave_days_count(rec.start_date, rec.end_date, v_ww);
    else
      v_hours := public.leave_hours_count(rec.start_time, rec.end_time);
      v_days := v_hours / 8.0;
    end if;

    if rec.leave_type = 'sick' then
      v_sick_used := v_sick_used + v_days;
    elsif rec.leave_type = 'entitlement' then
      v_ent_used := v_ent_used + v_days;
    else
      v_unpaid_used := v_unpaid_used + v_days;
    end if;
  end loop;

  return jsonb_build_object(
    'year', v_year,
    'sick_allowance', v_sick_allowance,
    'sick_used', round(v_sick_used::numeric, 2),
    'sick_remaining', round((v_sick_allowance - v_sick_used)::numeric, 2),
    'sick_exceeded', greatest(0, round((v_sick_used - v_sick_allowance)::numeric, 2)),
    'entitlement_allowance', v_ent_allowance,
    'entitlement_used', round(v_ent_used::numeric, 2),
    'entitlement_remaining', round((v_ent_allowance - v_ent_used)::numeric, 2),
    'entitlement_exceeded', greatest(0, round((v_ent_used - v_ent_allowance)::numeric, 2)),
    'unpaid_used', round(v_unpaid_used::numeric, 2)
  );
end;
$$;

-- ---------- submit leave ----------
create or replace function public.submit_leave_request(
  p_leave_type text,
  p_duration_type text,
  p_start_date date,
  p_end_date date,
  p_start_time time default null,
  p_end_time time default null,
  p_description text default null
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'unauthenticated');
  end if;

  if not exists (
    select 1 from public.profiles
    where user_id = v_uid and employment_status = 'active'
  ) then
    return jsonb_build_object('ok', false, 'code', 'inactive');
  end if;

  if p_leave_type not in ('sick', 'entitlement', 'unpaid') then
    return jsonb_build_object('ok', false, 'code', 'invalid_type');
  end if;
  if p_duration_type not in ('daily', 'hourly') then
    return jsonb_build_object('ok', false, 'code', 'invalid_duration');
  end if;
  if p_description is null or char_length(trim(p_description)) < 1 then
    return jsonb_build_object('ok', false, 'code', 'description_required');
  end if;
  if p_end_date < p_start_date then
    return jsonb_build_object('ok', false, 'code', 'invalid_dates');
  end if;
  if p_duration_type = 'hourly' then
    if p_start_date <> p_end_date or p_start_time is null or p_end_time is null then
      return jsonb_build_object('ok', false, 'code', 'invalid_hourly');
    end if;
    if p_end_time <= p_start_time then
      return jsonb_build_object('ok', false, 'code', 'invalid_time_range');
    end if;
  end if;

  insert into public.leave_requests (
    profile_id, leave_type, duration_type,
    start_date, end_date, start_time, end_time, description
  ) values (
    v_uid, p_leave_type, p_duration_type,
    p_start_date, p_end_date, p_start_time, p_end_time, trim(p_description)
  ) returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- ---------- review leave ----------
create or replace function public.review_leave_request(
  p_request_id bigint,
  p_action text,
  p_admin_note text default null
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  rec public.leave_requests;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  if p_action not in ('approve', 'reject') then
    return jsonb_build_object('ok', false, 'code', 'invalid_action');
  end if;

  select * into rec from public.leave_requests where id = p_request_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if rec.status <> 'pending' then
    return jsonb_build_object('ok', false, 'code', 'already_reviewed');
  end if;

  update public.leave_requests set
    status = case when p_action = 'approve' then 'approved' else 'rejected' end,
    admin_note = nullif(trim(coalesce(p_admin_note, '')), ''),
    reviewed_by = v_uid,
    reviewed_at = now(),
    updated_at = now()
  where id = p_request_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------- approved leave covers date? ----------
create or replace function public.has_approved_leave_on_date(p_profile uuid, p_date date)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.leave_requests lr
    where lr.profile_id = p_profile
      and lr.status = 'approved'
      and lr.duration_type = 'daily'
      and p_date between lr.start_date and lr.end_date
  );
$$;

-- ---------- update report_employee_summary with holidays + leave ----------
create or replace function public.report_employee_summary(
  p_from date,
  p_to date,
  p_employee uuid default null
)
returns table (
  profile_id             uuid,
  full_name              text,
  employee_code          text,
  expected_days          integer,
  present_days           integer,
  absent_days            integer,
  leave_days             integer,
  late_days              integer,
  late_minutes_total     bigint,
  early_leaves           integer,
  missed_checkouts       integer,
  worked_minutes_total   bigint,
  overtime_total         bigint
)
language plpgsql security definer
set search_path = public
as $$
declare
  tz text := public.app_timezone();
  ww integer[] := public.app_workweek();
  rec record;
  d date;
  wd integer;
  sched record;
  expd int;
  present_dates int;
  leave_days_count int;
begin
  if not public.is_admin() then
    raise insufficient_privilege;
  end if;

  for rec in
    select p.user_id, p.first_name || ' ' || p.last_name as full_name, p.employee_code
    from public.profiles p
    where p.role = 'employee'
      and (p_employee is null or p.user_id = p_employee)
    order by p.first_name, p.last_name
  loop
    select es.schedule_id, ws.working_days
      into sched
      from public.employee_schedules es
      join public.work_schedules ws on ws.id = es.schedule_id
      where es.profile_id = rec.user_id;

    expd := 0;
    for d in select generate_series(p_from, p_to, interval '1 day')::date loop
      if sched is not null then
        if public.is_working_day(d, sched.working_days) then expd := expd + 1; end if;
      else
        if public.is_working_day(d, ww) then expd := expd + 1; end if;
      end if;
    end loop;

    select count(distinct (s.checkin_at at time zone tz)::date)::int
      into present_dates
      from public.attendance_sessions s
      where s.profile_id = rec.user_id
        and (s.checkin_at at time zone tz)::date between p_from and p_to;

    select count(*)::int into leave_days_count
    from (
      select distinct d::date as ld
      from public.leave_requests lr,
           generate_series(lr.start_date, lr.end_date, interval '1 day') d
      where lr.profile_id = rec.user_id
        and lr.status = 'approved'
        and lr.duration_type = 'daily'
        and d::date between p_from and p_to
        and (
          (sched is not null and public.is_working_day(d::date, sched.working_days))
          or (sched is null and public.is_working_day(d::date, ww))
        )
    ) sub;

    return query
    with agg as (
      select
        count(*) filter (where s.late_minutes > 0)::int as late_days,
        coalesce(sum(s.late_minutes), 0)::bigint as late_min,
        count(*) filter (where s.early_leave_minutes > 0)::int as early_leaves,
        count(*) filter (where s.worked_minutes is null
                          and s.checkin_at < now() - interval '20 hours')::int as missed_out,
        coalesce(sum(s.worked_minutes), 0)::bigint as worked,
        coalesce(sum(s.overtime_minutes), 0)::bigint as over_min
      from public.attendance_sessions s
      where s.profile_id = rec.user_id
        and (s.checkin_at at time zone tz)::date between p_from and p_to
    )
    select
      rec.user_id,
      rec.full_name,
      rec.employee_code,
      expd,
      present_dates,
      greatest(0, expd - present_dates - leave_days_count)::int,
      leave_days_count,
      agg.late_days,
      agg.late_min,
      agg.early_leaves,
      agg.missed_out,
      agg.worked,
      agg.over_min
    from agg;
  end loop;
end;
$$;

-- ---------- upsert holidays (admin/service) ----------
create or replace function public.upsert_iran_holidays(p_holidays jsonb)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  item jsonb;
begin
  if not public.is_admin() then
    raise insufficient_privilege;
  end if;

  for item in select * from jsonb_array_elements(p_holidays)
  loop
    insert into public.iran_holidays (holiday_date, title, is_holiday, jalali_year)
    values (
      (item->>'date')::date,
      item->>'title',
      coalesce((item->>'is_holiday')::boolean, true),
      (item->>'jalali_year')::integer
    )
    on conflict (holiday_date) do update set
      title = excluded.title,
      is_holiday = excluded.is_holiday,
      jalali_year = excluded.jalali_year,
      fetched_at = now();
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ---------- RLS ----------
alter table public.iran_holidays enable row level security;
alter table public.leave_requests enable row level security;

create policy "iran_holidays: read authenticated"
on public.iran_holidays for select to authenticated
using (true);

create policy "iran_holidays: admin write"
on public.iran_holidays for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "leave_requests: read own or admin"
on public.leave_requests for select to authenticated
using (profile_id = auth.uid() or public.is_admin());

create policy "leave_requests: employee insert own"
on public.leave_requests for insert to authenticated
with check (profile_id = auth.uid() and status = 'pending');

create policy "leave_requests: admin update"
on public.leave_requests for update to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ---------- grants ----------
grant execute on function public.is_iranian_holiday(date) to authenticated;
grant execute on function public.leave_balance(uuid, integer) to authenticated;
grant execute on function public.submit_leave_request(text, text, date, date, time, time, text) to authenticated;
grant execute on function public.review_leave_request(bigint, text, text) to authenticated;
grant execute on function public.has_approved_leave_on_date(uuid, date) to authenticated;
grant execute on function public.upsert_iran_holidays(jsonb) to authenticated;
