-- Setlistan: shared checklist library + each user's own collection.

create table public.sets (
  id text primary key,
  name text not null,
  short_name text,
  keywords text not null default '',
  source text not null default '',
  source_urls text[] not null default '{}',
  notes text not null default '',
  verified boolean not null default false,
  status text not null default 'ready' check (status in ('fetching', 'ready')),
  created_by uuid references auth.users on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.sections (
  id bigint generated always as identity primary key,
  set_id text not null references public.sets on delete cascade,
  code text not null default '',
  name text not null,
  position int not null default 0,
  unique (set_id, code)
);

create table public.cards (
  id bigint generated always as identity primary key,
  set_id text not null references public.sets on delete cascade,
  section_id bigint not null references public.sections on delete cascade,
  no int not null,
  name text not null,
  team text not null default '',
  tags text[] not null default '{}',
  unique (section_id, no)
);
create index cards_set_idx on public.cards (set_id);

create table public.owned (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  card_id bigint not null references public.cards on delete cascade,
  set_id text not null references public.sets on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, card_id)
);
create index owned_user_set_idx on public.owned (user_id, set_id);

-- One row per Claude fetch, used for the per-user daily limit.
create table public.fetch_jobs (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  query text not null,
  set_id text,
  status text not null default 'running',
  error text,
  created_at timestamptz not null default now()
);

-- Card counts per set for the library list.
create view public.set_stats with (security_invoker = true) as
  select s.id, s.name, s.short_name, s.keywords, s.source, s.notes, s.verified, s.status, s.created_by, s.created_at,
         (select count(*) from public.cards c where c.set_id = s.id)::int as card_count,
         (select count(*) from public.sections x where x.set_id = s.id)::int as section_count
  from public.sets s;

-- How many cards the signed-in user has per set (RLS on owned limits it to their rows).
create view public.my_owned_counts with (security_invoker = true) as
  select set_id, count(*)::int as n from public.owned where user_id = auth.uid() group by set_id;

alter table public.sets enable row level security;
alter table public.sections enable row level security;
alter table public.cards enable row level security;
alter table public.owned enable row level security;
alter table public.fetch_jobs enable row level security;

-- The library is public to read.
create policy "sets readable" on public.sets for select to anon, authenticated using (true);
create policy "sections readable" on public.sections for select to anon, authenticated using (true);
create policy "cards readable" on public.cards for select to anon, authenticated using (true);

-- Signed-in users add sets (through the fetch route or a pasted list) and manage only their own.
create policy "sets insert own" on public.sets for insert to authenticated with check (created_by = auth.uid() and verified = false);
create policy "sets update own" on public.sets for update to authenticated using (created_by = auth.uid() and verified = false) with check (created_by = auth.uid() and verified = false);
create policy "sets delete own" on public.sets for delete to authenticated using (created_by = auth.uid() and verified = false);

create policy "sections write own set" on public.sections for insert to authenticated
  with check (exists (select 1 from public.sets s where s.id = set_id and s.created_by = auth.uid() and not s.verified));
create policy "sections update own set" on public.sections for update to authenticated
  using (exists (select 1 from public.sets s where s.id = set_id and s.created_by = auth.uid() and not s.verified));
create policy "cards write own set" on public.cards for insert to authenticated
  with check (exists (select 1 from public.sets s where s.id = set_id and s.created_by = auth.uid() and not s.verified));

-- Each user's collection is private.
create policy "owned select own" on public.owned for select to authenticated using (user_id = auth.uid());
create policy "owned insert own" on public.owned for insert to authenticated with check (user_id = auth.uid());
create policy "owned delete own" on public.owned for delete to authenticated using (user_id = auth.uid());

-- Fetch log: users read and add their own rows; no delete, so the daily limit holds.
create policy "jobs select own" on public.fetch_jobs for select to authenticated using (user_id = auth.uid());
create policy "jobs insert own" on public.fetch_jobs for insert to authenticated with check (user_id = auth.uid());
create policy "jobs update own" on public.fetch_jobs for update to authenticated using (user_id = auth.uid());
