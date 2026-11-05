-- Tradera history without personal data.
-- * tradera_auctions: every sold auction seen, once per Tradera item id (public information).
-- * tradera_searches: what was searched and what came back. No user id. Only admins can read it.
-- * tradera_calls: kept only to enforce the daily quota, so it no longer stores the query and is purged after 48 h.

create table if not exists public.tradera_auctions (
  item_id text primary key check (item_id ~ '^[0-9]{1,20}$'),
  title text not null,
  price integer not null check (price > 0),
  bids integer,
  ends_at timestamptz,
  url text not null,
  thumb text not null default '',
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index if not exists tradera_auctions_ends_idx on public.tradera_auctions (ends_at desc);
alter table public.tradera_auctions enable row level security;
drop policy if exists "auctions readable" on public.tradera_auctions;
create policy "auctions readable" on public.tradera_auctions for select to authenticated using (true);

create table if not exists public.tradera_searches (
  id bigint generated always as identity primary key,
  key text not null,
  ctx text not null default '',
  seen integer not null default 0,
  total integer not null default 0,
  sold integer not null default 0,
  median integer,
  min_price integer,
  max_price integer,
  from_cache boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists tradera_searches_created_idx on public.tradera_searches (created_at desc);
alter table public.tradera_searches enable row level security;
drop policy if exists "admin reads searches" on public.tradera_searches;
create policy "admin reads searches" on public.tradera_searches for select to authenticated using (public.is_admin());
drop policy if exists "admin deletes searches" on public.tradera_searches;
create policy "admin deletes searches" on public.tradera_searches for delete to authenticated using (public.is_admin());

-- Record one search (no user information).
create or replace function public.tradera_log(p_key text, p_ctx text, p_seen int, p_total int, p_sold int, p_median int, p_min int, p_max int, p_cached boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  insert into public.tradera_searches (key, ctx, seen, total, sold, median, min_price, max_price, from_cache)
  values (left(p_key, 200), left(coalesce(p_ctx, ''), 200), greatest(coalesce(p_seen, 0), 0), greatest(coalesce(p_total, 0), 0), greatest(coalesce(p_sold, 0), 0), p_median, p_min, p_max, coalesce(p_cached, false));
end $$;

-- Store sold auctions: validated, at most 40 per call, one row per Tradera item.
create or replace function public.tradera_store_auctions(p_items jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare r jsonb; n integer := 0; ends timestamptz;
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  if jsonb_typeof(p_items) <> 'array' then return 0; end if;
  for r in select * from jsonb_array_elements(p_items) limit 40 loop
    if coalesce(r->>'id', '') !~ '^[0-9]{1,20}$' then continue; end if;
    if coalesce(r->>'url', '') !~ '^https://([a-z0-9-]+\.)?tradera\.com/' then continue; end if;
    if coalesce((r->>'price')::numeric, 0) <= 0 then continue; end if;
    begin ends := (r->>'ends')::timestamptz; exception when others then ends := null; end;
    insert into public.tradera_auctions (item_id, title, price, bids, ends_at, url, thumb)
    values (r->>'id', left(coalesce(r->>'title', ''), 200), round((r->>'price')::numeric)::int, nullif(r->>'bids', '')::int, ends, left(r->>'url', 400),
            case when coalesce(r->>'thumb', '') ~ '^https://' then left(r->>'thumb', 400) else '' end)
    on conflict (item_id) do update set last_seen = now();
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function public.tradera_log(text, text, int, int, int, int, int, int, boolean) from public, anon;
revoke all on function public.tradera_store_auctions(jsonb) from public, anon;
grant execute on function public.tradera_log(text, text, int, int, int, int, int, int, boolean) to authenticated;
grant execute on function public.tradera_store_auctions(jsonb) to authenticated;

-- Quota bookkeeping without the query: only who/when, purged after 48 hours.
alter table public.tradera_calls drop column if exists key;
create or replace function public.tradera_reserve(p_key text)
returns text language plpgsql security definer set search_path = '' as $$
declare global_calls int; user_calls int; per_user int;
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  delete from public.tradera_calls where created_at < now() - interval '48 hours';
  select count(*) into global_calls from public.tradera_calls where created_at > now() - interval '24 hours';
  if global_calls >= 5000 then return 'global_limit'; end if;
  per_user := case when public.is_admin() then 300 else 100 end;
  select count(*) into user_calls from public.tradera_calls where user_id = auth.uid() and created_at > now() - interval '24 hours';
  if user_calls >= per_user then return 'user_limit'; end if;
  insert into public.tradera_calls (user_id) values (auth.uid());
  return 'ok';
end $$;
