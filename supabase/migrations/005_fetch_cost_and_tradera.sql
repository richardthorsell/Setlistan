-- Cost tracking for fetches, and the Tradera search cache and call quota.

alter table public.fetch_jobs
  add column input_tokens int not null default 0,
  add column output_tokens int not null default 0,
  add column cost_usd numeric(8,4) not null default 0;

create function public.fetch_spend_month() returns numeric
  language sql stable security definer set search_path = ''
as $$ select coalesce(sum(cost_usd), 0) from public.fetch_jobs where created_at >= date_trunc('month', now()) $$;
revoke execute on function public.fetch_spend_month() from public, anon;
grant execute on function public.fetch_spend_month() to authenticated;

create table public.tradera_cache (
  key text primary key,
  total int not null default 0,
  items jsonb not null default '[]',
  fetched_at timestamptz not null default now()
);
alter table public.tradera_cache enable row level security;
create policy "tradera cache readable" on public.tradera_cache for select to authenticated using (true);

create table public.tradera_calls (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  key text not null,
  created_at timestamptz not null default now()
);
create index tradera_calls_created_idx on public.tradera_calls (created_at);
alter table public.tradera_calls enable row level security;

-- Tradera allows 100 calls per 24 h for the app: 80 for the whole service, 10 per user (30 for admins).
create function public.tradera_reserve(p_key text) returns text
  language plpgsql security definer set search_path = ''
as $$
declare
  global_calls int;
  user_calls int;
  per_user int;
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  select count(*) into global_calls from public.tradera_calls where created_at > now() - interval '24 hours';
  if global_calls >= 80 then return 'global_limit'; end if;
  per_user := case when public.is_admin() then 30 else 10 end;
  select count(*) into user_calls from public.tradera_calls where user_id = auth.uid() and created_at > now() - interval '24 hours';
  if user_calls >= per_user then return 'user_limit'; end if;
  insert into public.tradera_calls (user_id, key) values (auth.uid(), left(p_key, 200));
  return 'ok';
end
$$;

create function public.tradera_cache_put(p_key text, p_total int, p_items jsonb) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  insert into public.tradera_cache (key, total, items, fetched_at) values (left(p_key, 200), p_total, p_items, now())
  on conflict (key) do update set total = excluded.total, items = excluded.items, fetched_at = excluded.fetched_at;
end
$$;

revoke execute on function public.tradera_reserve(text), public.tradera_cache_put(text, int, jsonb) from public, anon;
grant execute on function public.tradera_reserve(text), public.tradera_cache_put(text, int, jsonb) to authenticated;

create or replace function public.admin_overview() returns json
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;
  return json_build_object(
    'users', (select count(*) from auth.users),
    'collectors', (select count(distinct user_id) from public.owned),
    'owned', (select count(*) from public.owned),
    'sets', (select count(*) from public.sets),
    'fetches_24h', (select count(*) from public.fetch_jobs where created_at > now() - interval '24 hours'),
    'fetch_cost_month', public.fetch_spend_month(),
    'tradera_calls_24h', (select count(*) from public.tradera_calls where created_at > now() - interval '24 hours')
  );
end
$$;
