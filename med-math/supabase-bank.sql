-- Med Math test bank: run once after supabase-setup.sql (SQL Editor -> New query -> Run).
-- The instructor's test-bank questions and answer keys live only in the database, never in the
-- public page. Students fetch questions (without answers) with the class code, and their test is
-- graded here, so the answer key is never sent to the browser before they hand it in.
-- Load the questions with tools/import-bank.py (see README.md).
create table if not exists public.med_math_bank (
  id text primary key,
  owner uuid not null references auth.users on delete cascade,
  module text not null,                    -- chapter id in questions.js: m1 ... m24
  kind text not null check (kind in ('mc','blank')),
  prompt text not null,                    -- simple HTML
  choices jsonb not null default '[]'::jsonb,
  answers jsonb not null,                  -- one list of accepted answers per blank
  active boolean not null default true
);
create index if not exists med_math_bank_module_idx on public.med_math_bank (owner, module);
alter table public.med_math_bank enable row level security;
drop policy if exists "Own rows" on public.med_math_bank;
create policy "Own rows" on public.med_math_bank for all to authenticated using ((select auth.uid()) = owner) with check ((select auth.uid()) = owner);

create table if not exists public.med_math_settings (
  owner uuid primary key references auth.users on delete cascade default auth.uid(),
  class_code text not null default '',     -- students type this to open a test
  show_answers boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.med_math_settings enable row level security;
drop policy if exists "Own rows" on public.med_math_settings;
create policy "Own rows" on public.med_math_settings for all to authenticated using ((select auth.uid()) = owner) with check ((select auth.uid()) = owner);

-- "1,000", "7.5 mL", "1/2" and "1 1/2" all read as numbers.
create or replace function public.med_math_num(s text) returns numeric
language plpgsql immutable set search_path = public as $$
declare t text := btrim(regexp_replace(replace(lower(coalesce(s, '')), ',', ''), '\s+', ' ', 'g')); m text[];
begin
  m := regexp_match(t, '^(-?\d+) (\d+) ?/ ?(\d+)');
  if m is not null then return case when m[3]::numeric = 0 then null else m[1]::numeric + m[2]::numeric / m[3]::numeric end; end if;
  m := regexp_match(t, '^(-?\d+) ?/ ?(\d+)');
  if m is not null then return case when m[2]::numeric = 0 then null else m[1]::numeric / m[2]::numeric end; end if;
  m := regexp_match(t, '^(-?(?:\d+\.?\d*|\.\d+))');
  if m is not null then return m[1]::numeric; end if;
  return null;
end $$;

-- A blank is right when it matches an accepted answer as text (ignoring case and spaces), or,
-- for a number answer ("0.5" or "2205 mg"), has the same value (so 0.50, .5 and "0.5 mL" all match 0.5).
-- Fraction answers must match as written, so 6/16 does not count for 3/8.
create or replace function public.med_math_ok(given text, accepted jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
declare a text; g text := lower(regexp_replace(coalesce(given, ''), '\s+', '', 'g')); gn numeric := public.med_math_num(given);
begin
  if g = '' then return false; end if;
  for a in select jsonb_array_elements_text(accepted) loop
    if g = lower(regexp_replace(a, '\s+', '', 'g')) then return true; end if;
    if a ~ '^\s*-?[\d,]*\.?\d+\s*[A-Za-z%]*\s*$' and gn is not null and abs(gn - public.med_math_num(a)) < 0.0001 then return true; end if;
  end loop;
  return false;
end $$;

create or replace function public.med_math_mods(p_module text) returns text[]
language sql immutable as $$ select case when p_module in ('pre', 'post') then array['m1','m2','m3','m4'] else array[p_module] end $$;

create or replace function public.med_math_check_code(p_owner uuid, p_code text) returns public.med_math_settings
language plpgsql stable security definer set search_path = public as $$
declare s public.med_math_settings;
begin
  select * into s from public.med_math_settings where owner = p_owner;
  if not found then s.owner := p_owner; s.class_code := ''; s.show_answers := true; end if;
  if s.class_code <> '' and lower(btrim(coalesce(p_code, ''))) <> lower(btrim(s.class_code)) then raise exception 'That class code is not right. Ask your instructor for it.'; end if;
  return s;
end $$;

-- What the practice page needs before a test: is a code needed, and how many bank questions each chapter has.
create or replace function public.med_math_info(p_owner uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'code_required', coalesce((select class_code <> '' from public.med_math_settings where owner = p_owner), false),
    'counts', coalesce((select jsonb_object_agg(module, n) from (select module, count(*) n from public.med_math_bank where owner = p_owner and active group by module) c), '{}'::jsonb))
$$;

-- How many questions a test has: 20 for the pre/post-test, 10 for a chapter, or all of them if fewer.
create or replace function public.med_math_test_size(p_owner uuid, p_module text) returns integer
language sql stable security definer set search_path = public as $$
  select least(case when p_module in ('pre', 'post') then 20 else 10 end,
               (select count(*)::int from public.med_math_bank where owner = p_owner and active and module = any(public.med_math_mods(p_module))))
$$;

-- A fresh random test, without answers.
create or replace function public.med_math_quiz(p_owner uuid, p_code text, p_module text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  perform public.med_math_check_code(p_owner, p_code);
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'prompt', prompt, 'choices', choices, 'blanks', jsonb_array_length(answers)))
    from (select * from public.med_math_bank where owner = p_owner and active and module = any(public.med_math_mods(p_module))
          order by random() limit public.med_math_test_size(p_owner, p_module)) q), '[]'::jsonb);
end $$;

-- Grade a test, save it in the gradebook, and return the results.
create or replace function public.med_math_turn_in(
  p_owner uuid, p_code text, p_student text, p_email text, p_class text, p_module text, p_title text,
  p_seconds integer, p_responses jsonb
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  s public.med_math_settings; r record; b public.med_math_bank; ok boolean; i int;
  score int := 0; total int; detail jsonb := '[]'::jsonb; results jsonb := '[]'::jsonb; key text; given text; pct numeric;
begin
  s := public.med_math_check_code(p_owner, p_code);
  if coalesce(btrim(p_student), '') = '' then raise exception 'Enter your name'; end if;
  if length(p_student) > 120 or length(coalesce(p_email, '')) > 200 or length(coalesce(p_class, '')) > 60 or length(coalesce(p_title, '')) > 200 then raise exception 'Too long'; end if;
  total := jsonb_array_length(coalesce(p_responses, '[]'::jsonb));
  if total = 0 or total <> public.med_math_test_size(p_owner, p_module)
     or total <> (select count(distinct e->>'id') from jsonb_array_elements(p_responses) e) then raise exception 'This test is incomplete. Start a new test.'; end if;
  for r in select e->>'id' as id, coalesce(e->'given', '[]'::jsonb) as given from jsonb_array_elements(p_responses) e loop
    select * into b from public.med_math_bank where id = r.id and owner = p_owner and module = any(public.med_math_mods(p_module));
    if not found then raise exception 'This test has a question that is not in this chapter. Start a new test.'; end if;
    ok := true;
    for i in 0 .. jsonb_array_length(b.answers) - 1 loop
      if not public.med_math_ok(left(r.given->>i, 60), b.answers->i) then ok := false; end if;
    end loop;
    if ok then score := score + 1; end if;
    key := (select string_agg(a->>0, ', ') from jsonb_array_elements(b.answers) a);
    given := left((select string_agg(coalesce(g, ''), ', ') from jsonb_array_elements_text(r.given) g), 120);
    detail := detail || jsonb_build_object('q', left(btrim(regexp_replace(regexp_replace(b.prompt, '<[^>]+>', ' ', 'g'), '\s+', ' ', 'g')), 400), 'given', coalesce(given, ''), 'correct', key, 'ok', ok);
    results := results || jsonb_build_object('id', b.id, 'ok', ok, 'correct', case when s.show_answers then key end);
  end loop;
  pct := round(score * 100.0 / total, 1);
  insert into public.med_math_grades (owner, student, email, class_code, module, module_title, score, total, percent, seconds, answers)
  values (p_owner, btrim(p_student), btrim(coalesce(p_email, '')), btrim(coalesce(p_class, '')), p_module, coalesce(p_title, ''), score, total, pct, p_seconds, detail);
  return jsonb_build_object('score', score, 'total', total, 'percent', pct, 'results', results);
end $$;

revoke all on function public.med_math_check_code(uuid, text) from public, anon, authenticated;
revoke all on function public.med_math_test_size(uuid, text) from public, anon, authenticated;
revoke all on function public.med_math_info(uuid) from public;
revoke all on function public.med_math_quiz(uuid, text, text) from public;
revoke all on function public.med_math_turn_in(uuid, text, text, text, text, text, text, integer, jsonb) from public;
grant execute on function public.med_math_info(uuid) to anon, authenticated;
grant execute on function public.med_math_quiz(uuid, text, text) to anon, authenticated;
grant execute on function public.med_math_turn_in(uuid, text, text, text, text, text, text, integer, jsonb) to anon, authenticated;
