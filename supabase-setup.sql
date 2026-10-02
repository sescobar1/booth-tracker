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
