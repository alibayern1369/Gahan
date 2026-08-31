-- Fix: submit_attendance never wrote checkin_photo_path / checkout_photo_path.
-- Also backfill existing sessions from attached photo_uploads rows.

-- Backfill check-in selfies
update public.attendance_sessions s
set checkin_photo_path = pu.path
from public.photo_uploads pu
where s.checkin_photo_path is null
  and pu.attached_at is not null
  and pu.path like '%-in.jpg'
  and pu.profile_id = s.profile_id
  and abs(
    (substring(pu.path from '/(\d+)-in\.jpg$')::bigint / 1000.0)
    - extract(epoch from s.checkin_at)
  ) < 120;

-- Backfill check-out selfies
update public.attendance_sessions s
set checkout_photo_path = pu.path
from public.photo_uploads pu
where s.checkout_photo_path is null
  and pu.attached_at is not null
  and pu.path like '%-out.jpg'
  and pu.profile_id = s.profile_id
  and s.checkout_at is not null
  and abs(
    (substring(pu.path from '/(\d+)-out\.jpg$')::bigint / 1000.0)
    - extract(epoch from s.checkout_at)
  ) < 120;

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

  v_is_workday := case
                    when v_has_sched then v_local_dow = any (v_sched.working_days)
                    else v_local_dow = any (coalesce(v_settings.workweek_days, '{0,1,2,3,4}'))
                  end;

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

      if v_has_sched and v_is_workday and v_sched.start_time is not null then
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
