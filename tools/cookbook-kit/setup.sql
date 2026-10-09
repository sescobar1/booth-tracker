-- Family Cookbook: database setup.
-- In Supabase, open SQL Editor -> New query, paste ALL of this, and press Run.
-- Safe to run again; it only adds what's missing.

-- Recipes
create table if not exists public.family_recipes (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default '',
  category text not null default '',
  from_who text not null default '',
  ingredients text not null default '',
  steps text not null default '',
  notes text not null default '',
  photos jsonb not null default '[]'::jsonb,
  servings text not null default '',
  prep_time text not null default '',
  cook_time text not null default '',
  oven_temp text not null default '',
  folders jsonb not null default '[]'::jsonb,
  dish_photo jsonb,
  deleted_at timestamptz,
  edited_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The book itself: its name, folders, and the secret family link
create table if not exists public.family_recipe_share (
  owner uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  title text not null default 'Our family cookbook',
  folders jsonb not null default '[]'::jsonb
);

-- Only you (signed in) can read or change your rows directly
alter table public.family_recipes enable row level security;
alter table public.family_recipe_share enable row level security;
drop policy if exists "Own rows" on public.family_recipes;
create policy "Own rows" on public.family_recipes for all to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
drop policy if exists "Own rows" on public.family_recipe_share;
create policy "Own rows" on public.family_recipe_share for all to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
grant select, insert, update, delete on public.family_recipes, public.family_recipe_share to authenticated;

-- Photos (anyone with a photo's address can see it, like the recipes on the family link)
insert into storage.buckets (id, name, public) values ('recipes', 'recipes', true) on conflict (id) do nothing;
drop policy if exists "Recipe photos: add own" on storage.objects;
create policy "Recipe photos: add own" on storage.objects for insert to authenticated
  with check (bucket_id = 'recipes' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Recipe photos: delete own" on storage.objects;
create policy "Recipe photos: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'recipes' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Family link: read the book
create or replace function public.family_recipes_book(p_token text)
 returns jsonb language sql stable security definer set search_path to 'public'
as $function$
  select jsonb_build_object('title', s.title, 'folders', s.folders, 'recipes', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'title', r.title, 'category', r.category, 'from', r.from_who, 'ingredients', r.ingredients, 'steps', r.steps, 'notes', r.notes, 'photos', r.photos, 'servings', r.servings, 'prep', r.prep_time, 'cook', r.cook_time, 'temp', r.oven_temp, 'folders', r.folders, 'added', r.created_at, 'dish', r.dish_photo, 'by', r.edited_by) order by lower(r.title)) from family_recipes r where r.owner = s.owner and r.deleted_at is null), '[]'::jsonb))
  from family_recipe_share s where s.token = p_token and length(p_token) >= 20;
$function$;

-- Family link: add or change a recipe
create or replace function public.family_recipe_save(p_token text, p_id uuid, p_row jsonb, p_by text)
 returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare v_owner uuid; v_id uuid;
begin
  select owner into v_owner from family_recipe_share where token = p_token and length(p_token) >= 20;
  if v_owner is null then raise exception 'This recipe link doesn''t work.'; end if;
  if p_id is null then
    if coalesce(trim(p_row->>'title'),'') = '' then raise exception 'Give the recipe a name.'; end if;
    insert into family_recipes (owner, title, category, from_who, servings, prep_time, cook_time, oven_temp, ingredients, steps, notes, photos, dish_photo, edited_by)
    values (v_owner, left(p_row->>'title',200), coalesce(p_row->>'category',''), coalesce(p_row->>'from_who',''), coalesce(p_row->>'servings',''), coalesce(p_row->>'prep_time',''), coalesce(p_row->>'cook_time',''), coalesce(p_row->>'oven_temp',''),
      coalesce(p_row->>'ingredients',''), coalesce(p_row->>'steps',''), coalesce(p_row->>'notes',''), coalesce(p_row->'photos','[]'::jsonb), p_row->'dish_photo', left(p_by,60))
    returning id into v_id;
    return v_id;
  end if;
  update family_recipes set
    title = case when p_row ? 'title' and trim(p_row->>'title') <> '' then left(p_row->>'title',200) else title end,
    category = case when p_row ? 'category' then p_row->>'category' else category end,
    from_who = case when p_row ? 'from_who' then p_row->>'from_who' else from_who end,
    servings = case when p_row ? 'servings' then p_row->>'servings' else servings end,
    prep_time = case when p_row ? 'prep_time' then p_row->>'prep_time' else prep_time end,
    cook_time = case when p_row ? 'cook_time' then p_row->>'cook_time' else cook_time end,
    oven_temp = case when p_row ? 'oven_temp' then p_row->>'oven_temp' else oven_temp end,
    ingredients = case when p_row ? 'ingredients' then p_row->>'ingredients' else ingredients end,
    steps = case when p_row ? 'steps' then p_row->>'steps' else steps end,
    notes = case when p_row ? 'notes' then p_row->>'notes' else notes end,
    photos = case when p_row ? 'photos' then p_row->'photos' else photos end,
    dish_photo = case when p_row ? 'dish_photo' then nullif(p_row->'dish_photo','null'::jsonb) else dish_photo end,
    edited_by = left(p_by,60), updated_at = now()
  where id = p_id and owner = v_owner and deleted_at is null
  returning id into v_id;
  if v_id is null then raise exception 'That recipe is gone.'; end if;
  return v_id;
end $function$;

-- Family link: delete (goes to Recently deleted, where the owner can bring it back)
create or replace function public.family_recipe_delete(p_token text, p_id uuid, p_by text)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare v_owner uuid;
begin
  select owner into v_owner from family_recipe_share where token = p_token and length(p_token) >= 20;
  if v_owner is null then raise exception 'This recipe link doesn''t work.'; end if;
  update family_recipes set deleted_at = now(), edited_by = left(p_by,60) where id = p_id and owner = v_owner and deleted_at is null;
end $function$;

revoke all on function public.family_recipes_book(text) from public;
revoke all on function public.family_recipe_save(text, uuid, jsonb, text) from public;
revoke all on function public.family_recipe_delete(text, uuid, text) from public;
grant execute on function public.family_recipes_book(text) to anon, authenticated;
grant execute on function public.family_recipe_save(text, uuid, jsonb, text) to anon, authenticated;
grant execute on function public.family_recipe_delete(text, uuid, text) to anon, authenticated;
