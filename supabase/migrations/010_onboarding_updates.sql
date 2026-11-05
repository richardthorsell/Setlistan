-- Service behind sign-in, per-user onboarding state and a "what's new" feed.

-- Checklists are only readable when signed in.
drop policy if exists "sets readable" on public.sets;
create policy "sets readable" on public.sets for select to authenticated using (true);
drop policy if exists "sections readable" on public.sections;
create policy "sections readable" on public.sections for select to authenticated using (true);
drop policy if exists "cards readable" on public.cards;
create policy "cards readable" on public.cards for select to authenticated using (true);
drop policy if exists "parallels readable" on public.parallels;
create policy "parallels readable" on public.parallels for select to authenticated using (true);

create table if not exists public.user_state (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  onboarded_at timestamptz,
  updates_seen_at timestamptz
);
alter table public.user_state enable row level security;
drop policy if exists "own state read" on public.user_state;
create policy "own state read" on public.user_state for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "own state insert" on public.user_state;
create policy "own state insert" on public.user_state for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "own state update" on public.user_state;
create policy "own state update" on public.user_state for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table if not exists public.app_updates (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
alter table public.app_updates enable row level security;
drop policy if exists "updates readable" on public.app_updates;
create policy "updates readable" on public.app_updates for select to authenticated using (true);
drop policy if exists "admin writes updates" on public.app_updates;
create policy "admin writes updates" on public.app_updates for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.app_updates (title, body, created_at) values
  ('Betan är öppen för inbjudna', 'Tjänsten ligger nu bakom inloggning. Du kommer in via en inbjudan från väntelistan. Skicka gärna feedback via knappen uppe till höger.', now()),
  ('Sålda kort på Tradera', 'Tryck på T vid ett kort för att se vad liknande kort har sålts för på Tradera, med median, lägsta och högsta pris.', now() - interval '1 day'),
  ('Paralleller och serienummer', 'Pricka av paralleller som /50 och /25 för sig och skriv in serienummer per kort. Exportera listan per parallell.', now() - interval '2 days');
