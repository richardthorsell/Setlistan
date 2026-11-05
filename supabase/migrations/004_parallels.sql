-- Parallels (e.g. Gold /50) per set, and which parallel versions each user owns.

create table public.parallels (
  id bigint generated always as identity primary key,
  set_id text not null references public.sets on delete cascade,
  -- null = the parallel exists for every subset in the set
  section_id bigint references public.sections on delete cascade,
  name text not null,
  print_run int check (print_run is null or print_run > 0),
  position int not null default 0,
  unique (set_id, section_id, name)
);
create index parallels_set_idx on public.parallels (set_id);

create table public.owned_parallels (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  card_id bigint not null references public.cards on delete cascade,
  parallel_id bigint not null references public.parallels on delete cascade,
  set_id text not null references public.sets on delete cascade,
  serial text check (serial is null or length(serial) <= 20),
  created_at timestamptz not null default now(),
  primary key (user_id, card_id, parallel_id)
);
create index owned_parallels_user_set_idx on public.owned_parallels (user_id, set_id);

alter table public.parallels enable row level security;
alter table public.owned_parallels enable row level security;

create policy "parallels readable" on public.parallels for select to anon, authenticated using (true);
create policy "parallels write own set" on public.parallels for all to authenticated
  using (exists (select 1 from public.sets s where s.id = set_id and s.created_by = auth.uid() and not s.verified))
  with check (exists (select 1 from public.sets s where s.id = set_id and s.created_by = auth.uid() and not s.verified));
create policy "parallels admin" on public.parallels for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "owned parallels select own" on public.owned_parallels for select to authenticated using (user_id = auth.uid());
create policy "owned parallels insert own" on public.owned_parallels for insert to authenticated with check (user_id = auth.uid());
create policy "owned parallels update own" on public.owned_parallels for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "owned parallels delete own" on public.owned_parallels for delete to authenticated using (user_id = auth.uid());

-- Topps Flagship Premier League 2026/27: base parallels (Future Stars and Base), per checklistinsider.com / cardsmithsbreaks.com.
insert into public.parallels (set_id, section_id, name, print_run, position)
select 'topps-pl-flagship-2026-27', x.id, p.name, p.run, p.pos
from public.sections x,
  (values ('Blue Rainbow', 150, 1), ('Green Rainbow', 99, 2), ('Black & White Rainbow', 75, 3), ('Gold Rainbow', 50, 4),
          ('Netbuster', 38, 5), ('Orange Rainbow', 25, 6), ('Black Rainbow', 10, 7), ('Red Rainbow', 5, 8), ('Foilfractor', 1, 9)) as p(name, run, pos)
where x.set_id = 'topps-pl-flagship-2026-27' and x.code = '';
