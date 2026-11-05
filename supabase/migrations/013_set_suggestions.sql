-- Users suggest checklists they want added; a superuser/admin implements them.
create table if not exists public.set_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  email text,
  query text not null check (char_length(query) between 3 and 200),
  note text check (char_length(note) <= 500),
  status text not null default 'ny' check (status in ('ny', 'klar', 'avvisad')),
  created_at timestamptz not null default now(),
  handled_at timestamptz
);
alter table public.set_suggestions enable row level security;

drop policy if exists "suggest own" on public.set_suggestions;
create policy "suggest own" on public.set_suggestions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select count(*) from public.set_suggestions s where s.user_id = (select auth.uid()) and s.created_at > now() - interval '1 day') < 10
  );
drop policy if exists "read own suggestions" on public.set_suggestions;
create policy "read own suggestions" on public.set_suggestions for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
drop policy if exists "admin updates suggestions" on public.set_suggestions;
create policy "admin updates suggestions" on public.set_suggestions for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin deletes suggestions" on public.set_suggestions;
create policy "admin deletes suggestions" on public.set_suggestions for delete to authenticated using (public.is_admin());
