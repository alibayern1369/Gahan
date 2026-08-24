-- ============================================================
-- گاهان | Migration 0002 — Security-definer functions
-- All attendance acceptance logic runs INSIDE the database:
--   • identity resolved from auth.uid() (never trusted from client)
--   • distance computed server-side (Haversine)
--   • timestamps taken from clock_timestamp()
--   • state-machine + row locks prevent duplicates/races
-- ============================================================

-- ---------- helpers: role & settings ----------
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid()
      and role = 'admin'
      and employment_status = 'active'
  );
$$;

create or replace function public.app_timezone()
returns text
language sql stable security definer
set search_path = public
as $$
  select coalesce((select timezone from public.app_settings where id limit 1), 'Asia/Tehran');
$$;

create or replace function public.app_workweek()
returns integer[]
language sql stable security definer
set search_path = public
as $$
  select coalesce((select workweek_days from public.app_settings where id limit 1), '{0,1,2,3,4}');
$$;

create or replace function public.app_retention_days()
returns integer
language sql stable security definer
set search_path = public
as $$
  select coalesce((select selfie_retention_days from public.app_settings where id limit 1), 30);
$$;

-- ---------- Haversine distance in meters ----------
create or replace function public.haversine_m(
  lat1 double precision,
  lon1 double precision,
  lat2 double precision,
  lon2 double precision
)
returns double precision
language sql immutable
as $$
  select 6371000 * 2 * asin(
    sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)
    )
  );
$$;

-- ---------- suspicious event flagging (throttled) ----------
create or replace function public._flag_suspicious(
  p_profile uuid,
  p_type text,
  p_details jsonb,
  p_session bigint default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.suspicious_events
    where profile_id = p_profile
      and type = p_type
      and created_at > now() - interval '15 minutes'
  ) then
    insert into public.suspicious_events (profile_id, session_id, type, details)
    values (p_profile, p_session, p_type, coalesce(p_details, '{}'::jsonb));
  end if;
end;
$$;

-- ---------- photo upload ledger registration ----------
-- Client registers the storage path before uploading. Path must live inside the
-- caller's own folder and be a JPEG; enforced here.
create or replace function public.register_photo_upload(p_path text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise insufficient_privilege;
  end if;

  if p_path is null
     or position('..' in p_path) > 0
     or left(p_path, length(v_uid::text) + 1) <> v_uid::text || '/'
     or lower(right(p_path, 4)) not in ('.jpg')
     or length(p_path) > 200 then
    raise exception 'invalid_path' using errcode = 'P0001';
  end if;

  insert into public.photo_uploads (path, profile_id)
  values (p_path, v_uid)
  on conflict (path) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.photo_uploads where path = p_path and attached_at is null;
  end if;

  return v_id;
end;
$$;

-- ============================================================
-- submit_attendance — THE single authoritative entry point
-- ============================================================
create or replace function public.submit_attendance(
  p_type        text,               -- 'check_in' | 'check_out'
  p_latitude    double precision,
  p_longitude   double precision,
  p_accuracy    double precision,   -- meters, reported by browser GPS
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
begin
  ---------------------------------------------------------------- identity
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'unauthenticated');
  end if;

  select * into v_profile from public.profiles where user_id = v_uid;
  if not found or v_profile.employment_status <> 'active' then
    return jsonb_build_object('ok', false, 'code', 'inactive_profile');
  end if;

  ------------------------------------------------------------- basic input
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

  ------------------------------------------------------- assigned workplace
  select w.* into v_wp
  from public.employee_workplaces ew
  join public.workplaces w on w.id = ew.workplace_id
  where ew.profile_id = v_uid and w.is_active
  order by ew.is_primary desc, w.id asc
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'no_workplace');
  end if;

  ------------------------------------------------------- GPS accuracy gate
  v_maxacc := coalesce(v_settings.max_gps_accuracy_m, 100);
  if p_accuracy <= 0 or p_accuracy > v_maxacc then
    perform public._flag_suspicious(v_uid, 'low_accuracy',
      jsonb_build_object('accuracy', round(p_accuracy::numeric, 1), 'max_allowed', v_maxacc,
                         'lat', p_latitude, 'lng', p_longitude));
    return jsonb_build_object('ok', false, 'code', 'poor_accuracy',
                              'accuracy', round(p_accuracy::numeric, 1),
                              'max_accuracy', v_maxacc);
  end if;

  ------------------------------------------------------------ distance gate
  v_dist := public.haversine_m(p_latitude, p_longitude, v_wp.latitude, v_wp.longitude);
  if v_dist > v_wp.radius_m then
    perform public._flag_suspicious(v_uid, 'out_of_range_attempt',
      jsonb_build_object('lat', p_latitude, 'lng', p_longitude,
                         'distance_m', round(v_dist::numeric, 1),
                         'radius_m', v_wp.radius_m, 'accuracy', round(p_accuracy::numeric, 1)));
    return jsonb_build_object('ok', false, 'code', 'out_of_range',
                              'distance_m', round(v_dist::numeric, 1),
                              'radius_m', v_wp.radius_m);
  end if;

  ------------------------------------------------------------- photo ledger
  if p_photo_path is null
     or left(p_photo_path, length(v_uid::text) + 1) <> v_uid::text || '/'
     or not exists (
       select 1 from public.photo_uploads pu
       where pu.path = p_photo_path and pu.profile_id = v_uid and pu.attached_at is null
     ) then
    return jsonb_build_object('ok', false, 'code', 'invalid_photo');
  end if;

  ------------------------------------------------------ schedule & local time
  v_tz := coalesce(v_settings.timezone, 'Asia/Tehran');
  v_local := (v_now at time zone v_tz)::time;
  -- Postgres dow: 0=Sunday..6=Saturday → Persian index 0=شنبه..6=جمعه
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

  v_is_workday := case
                    when v_has_sched then v_local_dow = any (v_sched.working_days)
                    else v_local_dow = any (coalesce(v_settings.workweek_days, '{0,1,2,3,4}'))
                  end;

  begin
    if p_type = 'check_in' then
      ----------------------------------------------------------- CHECK IN
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
        -- rapid duplicate protection
        if v_now - v_last.checkin_at < interval '90 seconds'
           or (v_last.checkout_at is not null and v_now - v_last.checkout_at < interval '90 seconds') then
          perform public._flag_suspicious(v_uid, 'rapid_pattern',
            jsonb_build_object('last_session', v_last.id, 'gap_seconds',
              floor(extract(epoch from (v_now - coalesce(v_last.checkout_at, v_last.checkin_at))))::int));
          return jsonb_build_object('ok', false, 'code', 'duplicate_submission');
        end if;
        -- impossible travel heuristic (flags only — never blocks silently)
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

      -- late calculation against schedule start time + grace
      if v_has_sched and v_is_workday and v_sched.start_time is not null then
        v_late := greatest(0,
          ceil(extract(epoch from (v_local - v_sched.start_time)) / 60)::int - v_grace);
      end if;

      insert into public.attendance_sessions (
        profile_id, workplace_id,
        checkin_at, checkin_latitude, checkin_longitude, checkin_accuracy_m,
        checkin_distance_m, checkin_allowed_radius_m,
        late_minutes, checkin_ip, checkin_user_agent
      ) values (
        v_uid, v_wp.id,
        v_now, p_latitude, p_longitude, round(p_accuracy::numeric, 1)::double precision,
        round(v_dist::numeric, 1)::double precision, v_wp.radius_m,
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
      ---------------------------------------------------------- CHECK OUT
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

      if v_has_sched and v_is_workday and v_sched.end_time is not null then
        v_early := greatest(0, ceil(extract(epoch from (v_sched.end_time - v_local)) / 60)::int);
      end if;

      v_over := greatest(0, v_worked - v_expected);

      update public.attendance_sessions set
        checkout_at               = v_now,
        checkout_latitude         = p_latitude,
        checkout_longitude        = p_longitude,
        checkout_accuracy_m       = round(p_accuracy::numeric, 1)::double precision,
        checkout_distance_m       = round(v_dist::numeric, 1)::double precision,
        checkout_allowed_radius_m = v_wp.radius_m,
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
      -- concurrent double submission lost the race → treat as duplicate
      return jsonb_build_object('ok', false, 'code', 'already_checked_in');
  end;
end;
$$;

-- ============================================================
-- Pre-check used by the client BEFORE opening the camera.
-- Same rules as submit_attendance but performs no writes.
-- ============================================================
create or replace function public.validate_attendance_location(
  p_latitude  double precision,
  p_longitude double precision,
  p_accuracy  double precision
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_profile public.profiles;
  v_set     public.app_settings;
  v_wp      public.workplaces;
  v_maxacc  integer;
  v_dist    double precision;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'unauthenticated');
  end if;

  select * into v_profile from public.profiles where user_id = v_uid;
  if not found or v_profile.employment_status <> 'active' then
    return jsonb_build_object('ok', false, 'code', 'inactive_profile');
  end if;

  select w.* into v_wp
  from public.employee_workplaces ew
  join public.workplaces w on w.id = ew.workplace_id
  where ew.profile_id = v_uid and w.is_active
  order by ew.is_primary desc, w.id asc
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'no_workplace');
  end if;

  select * into v_set from public.app_settings where id limit 1;
  v_maxacc := coalesce(v_set.max_gps_accuracy_m, 100);

  if p_accuracy is null or p_accuracy <= 0 or p_accuracy > v_maxacc then
    return jsonb_build_object('ok', false, 'code', 'poor_accuracy',
      'accuracy', case when p_accuracy is null then null else round(p_accuracy::numeric, 1) end,
      'max_accuracy', v_maxacc);
  end if;

  v_dist := public.haversine_m(p_latitude, p_longitude, v_wp.latitude, v_wp.longitude);

  if v_dist > v_wp.radius_m then
    return jsonb_build_object('ok', false, 'code', 'out_of_range',
      'distance_m', round(v_dist::numeric, 1), 'radius_m', v_wp.radius_m);
  end if;

  return jsonb_build_object('ok', true,
    'distance_m', round(v_dist::numeric, 1), 'radius_m', v_wp.radius_m,
    'workplace', v_wp.name,
    'latitude', v_wp.latitude, 'longitude', v_wp.longitude);
end;
$$;

-- ============================================================
-- Reporting (admin-only, SECURITY DEFINER for clean aggregation)
-- ============================================================

create or replace function public.report_sessions(
  p_from date,
  p_to date,
  p_employee uuid default null,
  p_workplace bigint default null
)
returns table (
  session_id              bigint,
  profile_id              uuid,
  full_name               text,
  employee_code           text,
  workplace_name          text,
  checkin_at              timestamptz,
  checkout_at             timestamptz,
  late_minutes            integer,
  early_leave_minutes     integer,
  worked_minutes          integer,
  overtime_minutes        integer,
  checkin_distance_m      double precision,
  allowed_radius_m        integer,
  has_manual_adjustment   boolean,
  note                    text,
  checkin_photo_path      text,
  checkout_photo_path     text,
  checkin_photo_deleted   boolean,
  checkout_photo_deleted  boolean,
  is_suspicious           boolean
)
language sql security definer
set search_path = public
as $$
  select
    s.id,
    s.profile_id,
    p.first_name || ' ' || p.last_name,
    p.employee_code,
    w.name,
    s.checkin_at,
    s.checkout_at,
    s.late_minutes,
    s.early_leave_minutes,
    s.worked_minutes,
    s.overtime_minutes,
    s.checkin_distance_m,
    s.checkin_allowed_radius_m,
    s.has_manual_adjustment,
    s.note,
    s.checkin_photo_path,
    s.checkout_photo_path,
    (s.checkin_photo_deleted_at is not null),
    (s.checkout_photo_deleted_at is not null),
    exists (
      select 1 from public.suspicious_events se
      where se.session_id = s.id and not se.resolved
    )
  from public.attendance_sessions s
  join public.profiles p on p.user_id = s.profile_id
  left join public.workplaces w on w.id = s.workplace_id
  where ((s.checkin_at at time zone public.app_timezone())::date between p_from and p_to
         or (s.checkout_at at time zone public.app_timezone())::date between p_from and p_to)
    and (p_employee is null or s.profile_id = p_employee)
    and (p_workplace is null or s.workplace_id = p_workplace)
  order by s.checkin_at desc;
$$;

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
      wd := (extract(dow from d)::int + 1) % 7; -- 0=شنبه..6=جمعه
      if sched is not null then
        if wd = any (sched.working_days) then expd := expd + 1; end if;
      else
        if wd = any (ww) then expd := expd + 1; end if;
      end if;
    end loop;

    select count(distinct (s.checkin_at at time zone tz)::date)::int
      into present_dates
      from public.attendance_sessions s
      where s.profile_id = rec.user_id
        and (s.checkin_at at time zone tz)::date between p_from and p_to;

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
      greatest(0, expd - present_dates),
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

-- ============================================================
-- Dashboard KPIs (admin-only)
-- ============================================================
create or replace function public.dashboard_stats()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  tz text := public.app_timezone();
  today date := (now() at time zone tz)::date;
  result jsonb;
begin
  if not public.is_admin() then
    raise insufficient_privilege;
  end if;

  with stats as (
    select
      (select count(*) from public.profiles
        where role = 'employee' and employment_status = 'active')::int as total_active,

      (select count(distinct s.profile_id) from public.attendance_sessions s
        join public.profiles p on p.user_id = s.profile_id
        where (s.checkin_at at time zone tz)::date = today
          and p.employment_status = 'active')::int as present_today,

      (select count(distinct s.profile_id) from public.attendance_sessions s
        where (s.checkout_at at time zone tz)::date = today)::int as checked_out_today,

      (select count(*) from public.attendance_sessions s
        where (s.checkin_at at time zone tz)::date = today and s.late_minutes > 0)::int as late_today,

      (select count(*) from public.attendance_sessions s
        where s.checkout_at is null
          and (s.checkin_at at time zone tz)::date = today)::int as still_on_site,

      (select coalesce(round(avg(s.worked_minutes)), 0)
        from public.attendance_sessions s
        where s.worked_minutes is not null
          and s.checkin_at >= now() - interval '7 days')::int as avg_worked_week,

      (select count(*) from public.suspicious_events where not resolved)::int as open_suspicious
  )
  select jsonb_build_object(
    'today', today,
    'total_active', total_active,
    'present_today', present_today,
    'absent_today', greatest(0, total_active - present_today),
    'checked_out_today', checked_out_today,
    'late_today', late_today,
    'still_on_site', still_on_site,
    'avg_worked_week_minutes', avg_worked_week,
    'open_suspicious', open_suspicious
  )
  into result
  from stats;

  return result;
end;
$$;

-- ---------- tighten execute permissions ----------
revoke execute on function public.submit_attendance(text, double precision, double precision, double precision, text, text, text) from public, anon;
revoke execute on function public.validate_attendance_location(double precision, double precision, double precision) from public, anon;
revoke execute on function public.register_photo_upload(text) from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.dashboard_stats() from public, anon;
revoke execute on function public.report_sessions(date, date, uuid, bigint) from public, anon;
revoke execute on function public.report_employee_summary(date, date, uuid) from public, anon;

grant execute on function public.submit_attendance(text, double precision, double precision, double precision, text, text, text) to authenticated;
grant execute on function public.validate_attendance_location(double precision, double precision, double precision) to authenticated;
grant execute on function public.register_photo_upload(text) to authenticated;
grant execute on function public.is_admin() to authenticated;
