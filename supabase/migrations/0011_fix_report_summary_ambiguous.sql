-- Fix ambiguous column "d" in report_employee_summary:
-- PL/pgSQL loop variable `d` conflicted with generate_series alias `d` in leave subquery.

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
  day_date date;
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
    for day_date in select generate_series(p_from, p_to, interval '1 day')::date loop
      if sched is not null then
        if sched.schedule_type = 'rotational' then
          if public.rotation_cycle_day(day_date, sched.rotation_anchor_date) in (0, 1) then
            expd := expd + 1;
          end if;
        elsif public.is_working_day(day_date, sched.working_days) then
          expd := expd + 1;
        end if;
      elsif public.is_working_day(day_date, ww) then
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
      select distinct gs.leave_day::date as ld
      from public.leave_requests lr
      cross join lateral generate_series(lr.start_date, lr.end_date, interval '1 day') as gs(leave_day)
      where lr.profile_id = rec.user_id
        and lr.status = 'approved'
        and lr.duration_type = 'daily'
        and gs.leave_day::date between p_from and p_to
        and public.is_employee_working_day(rec.user_id, gs.leave_day::date)
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

revoke execute on function public.report_employee_summary(date, date, uuid) from public, anon;
