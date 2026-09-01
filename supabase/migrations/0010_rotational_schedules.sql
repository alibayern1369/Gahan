-- ============================================================
-- گاهان | Migration 0010 — Rotational (airport) shift schedules
-- 3-day cycle: morning → evening → off (group rotation)
-- ============================================================

alter table public.work_schedules
  add column if not exists schedule_type text not null default 'fixed'
    check (schedule_type in ('fixed', 'rotational'));

alter table public.work_schedules
  add column if not exists rotation_anchor_date date;

alter table public.work_schedules
  add column if not exists morning_start_time time;

alter table public.work_schedules
  add column if not exists morning_end_time time;

alter table public.work_schedules
  add column if not exists evening_start_time time;

alter table public.work_schedules
  add column if not exists evening_end_time time;

alter table public.work_schedules drop constraint if exists work_schedules_rotational_fields_chk;

alter table public.work_schedules add constraint work_schedules_rotational_fields_chk check (
  (schedule_type = 'fixed')
  or (
    schedule_type = 'rotational'
    and rotation_anchor_date is not null
    and morning_start_time is not null
    and morning_end_time is not null
    and evening_start_time is not null
    and evening_end_time is not null
  )
);

-- 0 = morning, 1 = evening, 2 = off
create or replace function public.rotation_cycle_day(p_date date, p_anchor date)
returns integer
language sql immutable
as $$
  select ((p_date - p_anchor) % 3 + 3) % 3;
$$;

create or replace function public.is_employee_working_day(p_profile uuid, p_date date)
returns boolean
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_sched public.work_schedules;
begin
  select s.* into v_sched
  from public.employee_schedules es
  join public.work_schedules s on s.id = es.schedule_id
  where es.profile_id = p_profile;

  if not found then
    return public.is_working_day(p_date, public.app_workweek());
  end if;

  if v_sched.schedule_type = 'rotational' then
    return public.rotation_cycle_day(p_date, v_sched.rotation_anchor_date) in (0, 1);
  end if;

  return public.is_working_day(p_date, v_sched.working_days);
end;
$$;

create or replace function public.leave_days_count_for_profile(
  p_profile uuid,
  p_start date,
  p_end date
)
returns numeric
language plpgsql stable security definer
set search_path = public
as $$
declare
  d date;
  cnt numeric := 0;
begin
  for d in select generate_series(p_start, p_end, interval '1 day')::date loop
    if public.is_employee_working_day(p_profile, d) then
      cnt := cnt + 1;
    end if;
  end loop;
  return cnt;
end;
$$;

-- ---------- leave balance: schedule-aware day counting ----------
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
      v_days := public.leave_days_count_for_profile(p_profile, rec.start_date, rec.end_date);
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

-- ---------- reports: expected days + leave for rotational ----------
drop function if exists public.report_employee_summary(date, date, uuid);

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
    select es.schedule_id, ws.working_days, ws.schedule_type, ws.rotation_anchor_date
      into sched
      from public.employee_schedules es
      join public.work_schedules ws on ws.id = es.schedule_id
      where es.profile_id = rec.user_id;

    expd := 0;
    for d in select generate_series(p_from, p_to, interval '1 day')::date loop
      if sched is not null then
        if sched.schedule_type = 'rotational' then
          if public.rotation_cycle_day(d, sched.rotation_anchor_date) in (0, 1) then
            expd := expd + 1;
          end if;
        elsif public.is_working_day(d, sched.working_days) then
          expd := expd + 1;
        end if;
      elsif public.is_working_day(d, ww) then
        expd := expd + 1;
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
        and public.is_employee_working_day(rec.user_id, d::date)
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

-- ---------- attendance: rotational late / early / overtime ----------
create or replace function public.submit_attendance(
  p_type        text,
  p_latitude    double precision,
  p_longitude   double precision,
  p_accuracy    double precision,
  p_photo_path  text,
  p_user_agent  text default null,
  p_ip          text default null
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_profile   public.profiles;
  v_settings  public.app_settings;
  v_wp        public.workplaces;
  v_wp_id     bigint;
  v_sched     public.work_schedules;
  v_has_sched boolean := false;
  v_open      public.attendance_sessions;
  v_last      public.attendance_sessions;
  v_new       public.attendance_sessions;

  v_dist      double precision;
  v_maxacc    integer;
  v_now       timestamptz := clock_timestamp();
  v_tz        text;
  v_local     time;
  v_local_dow integer;
  v_grace     integer;
  v_expected  integer;
  v_late      integer := 0;
  v_early     integer := 0;
  v_worked    integer := null;
  v_over      integer := 0;
  v_ip        inet;
  v_is_workday boolean := false;

  v_checkin_date date;
  v_cycle        integer;
  v_shift_start  time;
  v_shift_end    time;
  v_shift_end_ts timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'unauthenticated');
  end if;

  select * into v_profile from public.profiles where user_id = v_uid;
  if not found or v_profile.employment_status <> 'active' then
    return jsonb_build_object('ok', false, 'code', 'inactive_profile');
  end if;

  if p_type not in ('check_in', 'check_out') then
    return jsonb_build_object('ok', false, 'code', 'server_error');
  end if;
  if p_latitude is null or p_longitude is null
     or abs(p_latitude) > 90 or abs(p_longitude) > 180
     or p_accuracy is null then
    return jsonb_build_object('ok', false, 'code', 'out_of_range');
  end if;

  begin
    v_ip := p_ip::inet;
  exception when others then
    v_ip := null;
  end;

  select * into v_settings from public.app_settings where id limit 1;

  select ew.workplace_id, d.dist
    into v_wp_id, v_dist
  from public.employee_workplaces ew
  join public.workplaces w on w.id = ew.workplace_id
  cross join lateral (
    select public.haversine_m(p_latitude, p_longitude, w.latitude, w.longitude) as dist
  ) d
  where ew.profile_id = v_uid
    and w.is_active
    and d.dist <= w.radius_m
  order by d.dist asc, ew.is_primary desc, w.id asc
  limit 1;

  if found then
    select * into v_wp from public.workplaces where id = v_wp_id;
  else
    select ew.workplace_id, d.dist
      into v_wp_id, v_dist
    from public.employee_workplaces ew
    join public.workplaces w on w.id = ew.workplace_id
    cross join lateral (
      select public.haversine_m(p_latitude, p_longitude, w.latitude, w.longitude) as dist
    ) d
    where ew.profile_id = v_uid and w.is_active
    order by d.dist asc, ew.is_primary desc, w.id asc
    limit 1;

    if not found then
      return jsonb_build_object('ok', false, 'code', 'no_workplace');
    end if;

    select * into v_wp from public.workplaces where id = v_wp_id;

    perform public._flag_suspicious(v_uid, 'out_of_range_attempt',
      jsonb_build_object('lat', p_latitude, 'lng', p_longitude,
                         'distance_m', round(v_dist::numeric, 1),
                         'radius_m', v_wp.radius_m, 'accuracy', round(p_accuracy::numeric, 1)));
    return jsonb_build_object('ok', false, 'code', 'out_of_range',
                              'distance_m', round(v_dist::numeric, 1),
                              'radius_m', v_wp.radius_m);
  end if;

  v_maxacc := coalesce(v_settings.max_gps_accuracy_m, 100);
  if p_accuracy <= 0 or p_accuracy > v_maxacc then
    perform public._flag_suspicious(v_uid, 'low_accuracy',
      jsonb_build_object('accuracy', round(p_accuracy::numeric, 1), 'max_allowed', v_maxacc,
                         'lat', p_latitude, 'lng', p_longitude));
    return jsonb_build_object('ok', false, 'code', 'poor_accuracy',
                              'accuracy', round(p_accuracy::numeric, 1),
                              'max_accuracy', v_maxacc);
  end if;

  if p_photo_path is null
     or left(p_photo_path, length(v_uid::text) + 1) <> v_uid::text || '/'
     or not exists (
       select 1 from public.photo_uploads pu
       where pu.path = p_photo_path and pu.profile_id = v_uid and pu.attached_at is null
     ) then
    return jsonb_build_object('ok', false, 'code', 'invalid_photo');
  end if;

  v_tz := coalesce(v_settings.timezone, 'Asia/Tehran');
  v_local := (v_now at time zone v_tz)::time;
  v_local_dow := (extract(dow from (v_now at time zone v_tz)::date)::int + 1) % 7;

  select s.* into v_sched
  from public.employee_schedules es
  join public.work_schedules s on s.id = es.schedule_id
  where es.profile_id = v_uid
  limit 1;
  v_has_sched := found;

  v_grace := case when v_has_sched then v_sched.grace_minutes
                  else coalesce(v_settings.grace_minutes, 10) end;
  v_expected := case
                  when v_has_sched and v_sched.expected_hours is not null
                    then round(v_sched.expected_hours * 60)::int
                  else round(coalesce(v_settings.default_work_hours, 8) * 60)::int
                end;

  if v_has_sched and v_sched.schedule_type = 'rotational' then
    v_checkin_date := (v_now at time zone v_tz)::date;
    v_cycle := public.rotation_cycle_day(v_checkin_date, v_sched.rotation_anchor_date);
    v_is_workday := v_cycle in (0, 1);
  else
    v_is_workday := case
                      when v_has_sched then v_local_dow = any (v_sched.working_days)
                      else v_local_dow = any (coalesce(v_settings.workweek_days, '{0,1,2,3,4}'))
                    end;
  end if;

  begin
    if p_type = 'check_in' then
      select * into v_open
      from public.attendance_sessions
      where profile_id = v_uid and checkout_at is null
      order by checkin_at desc
      limit 1
      for update;

      if found then
        return jsonb_build_object('ok', false, 'code', 'already_checked_in', 'session_id', v_open.id);
      end if;

      select * into v_last
      from public.attendance_sessions
      where profile_id = v_uid
      order by checkin_at desc
      limit 1;

      if found then
        if v_now - v_last.checkin_at < interval '90 seconds'
           or (v_last.checkout_at is not null and v_now - v_last.checkout_at < interval '90 seconds') then
          perform public._flag_suspicious(v_uid, 'rapid_pattern',
            jsonb_build_object('last_session', v_last.id, 'gap_seconds',
              floor(extract(epoch from (v_now - coalesce(v_last.checkout_at, v_last.checkin_at))))::int));
          return jsonb_build_object('ok', false, 'code', 'duplicate_submission');
        end if;
        if v_last.checkout_latitude is not null and v_last.checkout_at is not null then
          if public.haversine_m(v_last.checkout_latitude, v_last.checkout_longitude, p_latitude, p_longitude) > 25000
             and v_now - v_last.checkout_at < interval '30 minutes' then
            perform public._flag_suspicious(v_uid, 'impossible_jump',
              jsonb_build_object('from_lat', v_last.checkout_latitude, 'from_lng', v_last.checkout_longitude,
                                 'to_lat', p_latitude, 'to_lng', p_longitude,
                                 'minutes_between', floor(extract(epoch from (v_now - v_last.checkout_at)) / 60)::int),
              v_last.id);
          end if;
        end if;
      end if;

      if v_has_sched and v_sched.schedule_type = 'rotational' then
        if v_cycle = 0 then
          v_shift_start := v_sched.morning_start_time;
          v_late := greatest(0,
            ceil(extract(epoch from (v_local - v_shift_start)) / 60)::int - v_grace);
        elsif v_cycle = 1 then
          v_shift_start := v_sched.evening_start_time;
          v_late := greatest(0,
            ceil(extract(epoch from (v_local - v_shift_start)) / 60)::int - v_grace);
        end if;
      elsif v_has_sched and v_is_workday and v_sched.start_time is not null then
        v_late := greatest(0,
          ceil(extract(epoch from (v_local - v_sched.start_time)) / 60)::int - v_grace);
      end if;

      insert into public.attendance_sessions (
        profile_id, workplace_id,
        checkin_at, checkin_latitude, checkin_longitude, checkin_accuracy_m,
        checkin_distance_m, checkin_allowed_radius_m,
        checkin_photo_path,
        late_minutes, checkin_ip, checkin_user_agent
      ) values (
        v_uid, v_wp.id,
        v_now, p_latitude, p_longitude, round(p_accuracy::numeric, 1)::double precision,
        round(v_dist::numeric, 1)::double precision, v_wp.radius_m,
        p_photo_path,
        v_late, v_ip, left(coalesce(p_user_agent, ''), 400)
      ) returning * into v_new;

      update public.photo_uploads
      set attached_at = clock_timestamp()
      where path = p_photo_path and profile_id = v_uid;

      return jsonb_build_object(
        'ok', true, 'type', 'check_in', 'session_id', v_new.id,
        'at', v_new.checkin_at, 'late_minutes', v_late,
        'distance_m', round(v_dist::numeric, 1), 'radius_m', v_wp.radius_m,
        'workplace', v_wp.name
      );

    else
      select * into v_open
      from public.attendance_sessions
      where profile_id = v_uid and checkout_at is null
      order by checkin_at desc
      limit 1
      for update;

      if not found then
        return jsonb_build_object('ok', false, 'code', 'no_open_session');
      end if;

      if v_now - v_open.checkin_at < interval '60 seconds' then
        perform public._flag_suspicious(v_uid, 'rapid_pattern',
          jsonb_build_object('session_id', v_open.id, 'reason', 'instant_checkout'));
        return jsonb_build_object('ok', false, 'code', 'duplicate_submission');
      end if;

      v_worked := floor(extract(epoch from (v_now - v_open.checkin_at)) / 60)::int;

      if v_has_sched and v_sched.schedule_type = 'rotational' then
        v_checkin_date := (v_open.checkin_at at time zone v_tz)::date;
        v_cycle := public.rotation_cycle_day(v_checkin_date, v_sched.rotation_anchor_date);

        if v_cycle = 2 then
          v_over := v_worked;
          v_early := 0;
        else
          if v_cycle = 0 then
            v_shift_start := v_sched.morning_start_time;
            v_shift_end := v_sched.morning_end_time;
          else
            v_shift_start := v_sched.evening_start_time;
            v_shift_end := v_sched.evening_end_time;
          end if;

          if v_shift_end >= v_shift_start then
            v_shift_end_ts := (v_checkin_date + v_shift_end) at time zone v_tz;
          else
            v_shift_end_ts := (v_checkin_date + interval '1 day' + v_shift_end) at time zone v_tz;
          end if;

          v_early := greatest(0, floor(extract(epoch from (v_shift_end_ts - v_now)) / 60)::int);
          v_over := greatest(0, floor(extract(epoch from (v_now - v_shift_end_ts)) / 60)::int);
        end if;
      else
        if v_has_sched and v_is_workday and v_sched.end_time is not null then
          v_early := greatest(0, ceil(extract(epoch from (v_sched.end_time - v_local)) / 60)::int);
        end if;
        v_over := greatest(0, v_worked - v_expected);
      end if;

      update public.attendance_sessions set
        checkout_at               = v_now,
        checkout_latitude         = p_latitude,
        checkout_longitude        = p_longitude,
        checkout_accuracy_m       = round(p_accuracy::numeric, 1)::double precision,
        checkout_distance_m       = round(v_dist::numeric, 1)::double precision,
        checkout_allowed_radius_m = v_wp.radius_m,
        checkout_photo_path       = p_photo_path,
        worked_minutes            = v_worked,
        overtime_minutes          = v_over,
        early_leave_minutes       = v_early,
        checkout_ip               = v_ip,
        checkout_user_agent       = left(coalesce(p_user_agent, ''), 400),
        updated_at                = clock_timestamp()
      where id = v_open.id
      returning * into v_new;

      update public.photo_uploads
      set attached_at = clock_timestamp()
      where path = p_photo_path and profile_id = v_uid;

      return jsonb_build_object(
        'ok', true, 'type', 'check_out', 'session_id', v_new.id,
        'at', v_new.checkout_at, 'worked_minutes', v_worked,
        'overtime_minutes', v_over, 'early_leave_minutes', v_early,
        'distance_m', round(v_dist::numeric, 1), 'radius_m', v_wp.radius_m,
        'workplace', v_wp.name
      );
    end if;

  exception
    when unique_violation then
      return jsonb_build_object('ok', false, 'code', 'already_checked_in');
  end;
end;
$$;
