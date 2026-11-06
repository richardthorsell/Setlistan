-- Players: search across all sets by player name and follow ("favourite") a player.
-- Step 1 keeps the player as a normalised name (no separate players table yet).

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- lower-case, accent-free, single-spaced version of a name ("Jaromír  Jágr" -> "jaromir jagr").
create or replace function public.name_key(t text) returns text
language sql immutable parallel safe set search_path = ''
as $$ select lower(btrim(regexp_replace(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(t, '')), '\s+', ' ', 'g'))) $$;

create index if not exists cards_namekey_trgm on public.cards using gin (public.name_key(name) extensions.gin_trgm_ops);

create table if not exists public.favorite_players (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  player_key text not null check (char_length(player_key) between 3 and 80),
  display_name text not null check (char_length(display_name) between 1 and 120),
  created_at timestamptz not null default now(),
  primary key (user_id, player_key)
);
alter table public.favorite_players enable row level security;
create policy "own favorite players read" on public.favorite_players for select using (user_id = (select auth.uid()));
create policy "own favorite players insert" on public.favorite_players for insert with check (user_id = (select auth.uid()));
create policy "own favorite players delete" on public.favorite_players for delete using (user_id = (select auth.uid()));

-- Players whose name matches q (single-player cards only), most cards first.
create or replace function public.search_players(q text)
returns table (player_key text, display_name text, cards bigint, sets bigint)
language sql stable set search_path = ''
as $$
  with k as (select replace(replace(replace(public.name_key(q), '\', '\\'), '%', '\%'), '_', '\_') as kq)
  select public.name_key(c.name) as player_key,
         mode() within group (order by c.name) as display_name,
         count(*) as cards,
         count(distinct c.set_id) as sets
  from public.cards c, k
  where char_length(k.kq) >= 3
    and public.name_key(c.name) like '%' || k.kq || '%'
    and c.name not like '%/%'
    and c.name !~ '\d'
  group by public.name_key(c.name), k.kq
  order by (public.name_key(c.name) = replace(k.kq, '\', '')) desc, count(*) desc
  limit 30
$$;

-- Every card of one player (also cards shared with other players: "A / B / C"), with the caller's own count.
create or replace function public.player_cards(p_key text)
returns table (card_id bigint, set_id text, set_name text, sport text, section_code text, section_name text, no integer, name text, team text, qty integer)
language sql stable set search_path = ''
as $$
  select c.id, c.set_id, s.name, s.sport, x.code, x.name, c.no, c.name, c.team,
         case when o.card_id is null then null else coalesce(o.qty, 1) end
  from public.cards c
  join public.sets s on s.id = c.set_id
  join public.sections x on x.id = c.section_id
  left join public.owned o on o.card_id = c.id and o.user_id = auth.uid()
  where char_length(p_key) >= 3
    and public.name_key(c.name) like '%' || replace(replace(replace(p_key, '\', '\\'), '%', '\%'), '_', '\_') || '%'
    and p_key = any (select btrim(part) from unnest(string_to_array(public.name_key(c.name), ' / ')) as part)
  order by s.name, x.position, c.no, c.id
  limit 3000
$$;

grant execute on function public.search_players(text) to authenticated;
grant execute on function public.player_cards(text) to authenticated;
revoke execute on function public.search_players(text) from anon, public;
revoke execute on function public.player_cards(text) from anon, public;
