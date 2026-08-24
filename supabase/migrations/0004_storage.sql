-- ============================================================
-- گاهان | Migration 0004 — Storage buckets & policies
--
-- selfies   → PRIVATE bucket. Attendance selfies are never public.
--             Clients upload into their OWN folder (uid/…).
-- branding  → PUBLIC bucket (logos/favicon must be reachable by
--             browsers without auth). Only admins can write.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'selfies', 'selfies', false,
  524288, -- 512 KB hard limit per file
  array['image/jpeg']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'branding', 'branding', true,
  1048576, -- 1 MB
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
  set public = true,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------- selfies: strict ownership ----------
drop policy if exists "selfies: upload own folder" on storage.objects;
create policy "selfies: upload own folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'selfies'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "selfies: read own folder or admin" on storage.objects;
create policy "selfies: read own folder or admin"
on storage.objects for select to authenticated
using (
  bucket_id = 'selfies'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);

drop policy if exists "selfies: delete own folder or admin" on storage.objects;
create policy "selfies: delete own folder or admin"
on storage.objects for delete to authenticated
using (
  bucket_id = 'selfies'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);

-- ---------- branding: public read, admin-only write ----------
drop policy if exists "branding: public read" on storage.objects;
create policy "branding: public read"
on storage.objects for select to public
using (bucket_id = 'branding');

drop policy if exists "branding: admin write" on storage.objects;
create policy "branding: admin write"
on storage.objects for insert to authenticated
with check (bucket_id = 'branding' and public.is_admin());

drop policy if exists "branding: admin update" on storage.objects;
create policy "branding: admin update"
on storage.objects for update to authenticated
using (bucket_id = 'branding' and public.is_admin());

drop policy if exists "branding: admin delete" on storage.objects;
create policy "branding: admin delete"
on storage.objects for delete to authenticated
using (bucket_id = 'branding' and public.is_admin());
