-- Each user's favourite albums (private).
create table if not exists public.favorites (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  set_id text not null references public.sets(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, set_id)
);
alter table public.favorites enable row level security;
drop policy if exists "own favorites read" on public.favorites;
create policy "own favorites read" on public.favorites for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "own favorites insert" on public.favorites;
create policy "own favorites insert" on public.favorites for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "own favorites delete" on public.favorites;
create policy "own favorites delete" on public.favorites for delete to authenticated using (user_id = (select auth.uid()));
