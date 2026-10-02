-- Booth Tracker sync: run this once in your Supabase project (SQL Editor -> New query -> Run).
-- One row per person holds their booth data. Row Level Security means each signed-in
-- person can only read and change their own row.
create table if not exists public.booth_data (
  user_id uuid primary key references auth.users on delete cascade default auth.uid(),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  device text
);

alter table public.booth_data enable row level security;

drop policy if exists "Own booth data" on public.booth_data;
create policy "Own booth data" on public.booth_data
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Send live updates to your other signed-in devices.
alter publication supabase_realtime add table public.booth_data;

-- Photo lookup: photos are kept for a day so Google Lens can open them by web address.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lens', 'lens', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create policy "Lens photos: add own" on storage.objects for insert to authenticated
  with check (bucket_id = 'lens' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Lens photos: see own" on storage.objects for select to authenticated
  using (bucket_id = 'lens' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Lens photos: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'lens' and (storage.foldername(name))[1] = (select auth.uid())::text);
