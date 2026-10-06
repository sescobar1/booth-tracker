-- Med Math practice: run once in Supabase (SQL Editor -> New query -> Run).
-- Students hand in test grades from the public page (no sign-in). Only the instructor
-- account named in config.js (the owner) can read them, on teacher.html.
create table if not exists public.med_math_grades (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users on delete cascade,
  student text not null,
  email text not null default '',
  class_code text not null default '',
  module text not null,
  module_title text not null default '',
  score integer not null,
  total integer not null,
  percent numeric(5,1) not null,
  seconds integer,
  answers jsonb not null default '[]'::jsonb,
  submitted_at timestamptz not null default now()
);
create index if not exists med_math_grades_owner_idx on public.med_math_grades (owner, submitted_at desc);

alter table public.med_math_grades enable row level security;
drop policy if exists "Own rows" on public.med_math_grades;
create policy "Own rows" on public.med_math_grades
  for all to authenticated
  using ((select auth.uid()) = owner)
  with check ((select auth.uid()) = owner);

-- Students are not signed in, so they hand in a grade through this function only.
create or replace function public.med_math_submit(
  p_owner uuid, p_student text, p_email text, p_class text, p_module text, p_title text,
  p_score integer, p_total integer, p_seconds integer, p_answers jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if p_owner is null or not exists (select 1 from auth.users where id = p_owner) then raise exception 'Unknown class'; end if;
  if coalesce(btrim(p_student), '') = '' then raise exception 'Enter your name'; end if;
  if p_total is null or p_total < 1 or p_total > 100 or p_score is null or p_score < 0 or p_score > p_total then raise exception 'Bad score'; end if;
  if length(p_student) > 120 or length(coalesce(p_email,'')) > 200 or length(coalesce(p_class,'')) > 60
     or length(p_module) > 40 or length(coalesce(p_title,'')) > 200 or length(coalesce(p_answers::text,'')) > 60000 then
    raise exception 'Too long';
  end if;
  insert into public.med_math_grades (owner, student, email, class_code, module, module_title, score, total, percent, seconds, answers)
  values (p_owner, btrim(p_student), btrim(coalesce(p_email,'')), btrim(coalesce(p_class,'')), p_module, coalesce(p_title,''),
          p_score, p_total, round(p_score * 100.0 / p_total, 1), p_seconds, coalesce(p_answers, '[]'::jsonb))
  returning id into new_id;
  return new_id;
end $$;
revoke all on function public.med_math_submit(uuid, text, text, text, text, text, integer, integer, integer, jsonb) from public;
grant execute on function public.med_math_submit(uuid, text, text, text, text, text, integer, integer, integer, jsonb) to anon, authenticated;
