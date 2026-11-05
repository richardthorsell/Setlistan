-- Each user's favourite cards (players that are extra valuable to them). Private.
create table if not exists public.favorite_cards (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  card_id bigint not null references public.cards(id) on delete cascade,
  set_id text not null references public.sets(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, card_id)
);
create index if not exists favorite_cards_user_set_idx on public.favorite_cards (user_id, set_id);
alter table public.favorite_cards enable row level security;
drop policy if exists "own favorite cards read" on public.favorite_cards;
create policy "own favorite cards read" on public.favorite_cards for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "own favorite cards insert" on public.favorite_cards;
create policy "own favorite cards insert" on public.favorite_cards for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "own favorite cards delete" on public.favorite_cards;
create policy "own favorite cards delete" on public.favorite_cards for delete to authenticated using (user_id = (select auth.uid()));
