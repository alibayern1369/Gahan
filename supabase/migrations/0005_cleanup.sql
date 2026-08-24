-- ============================================================
-- گاهان | Migration 0005 — Photo retention helpers
-- Used by the cleanup job (Vercel Cron or Supabase Edge Function).
-- Files are removed from Storage; attendance records are KEPT and
-- only flagged with photo_deleted_at so history stays intact.
-- ============================================================

create or replace function public.mark_photos_deleted(p_paths text[])
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  -- Only the cleanup job (service role / definer) reaches this point.
  update public.attendance_sessions s set
    checkin_photo_deleted_at  = case when s.checkin_photo_path  = any (p_paths) then coalesce(s.checkin_photo_deleted_at, now()) else s.checkin_photo_deleted_at end,
    checkout_photo_deleted_at = case when s.checkout_photo_path = any (p_paths) then coalesce(s.checkout_photo_deleted_at, now()) else s.checkout_photo_deleted_at end,
    updated_at                = now()
  where s.checkin_photo_path = any (p_paths)
     or s.checkout_photo_path = any (p_paths);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.mark_photos_deleted(text[]) from public, anon;
