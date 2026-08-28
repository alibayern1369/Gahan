-- Allow login/branding pages to read public app settings before sign-in.
drop policy if exists "settings: public read" on public.app_settings;
create policy "settings: public read"
on public.app_settings for select to anon, authenticated
using (true);
