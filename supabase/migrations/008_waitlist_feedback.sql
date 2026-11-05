-- Beta waitlist and in-app feedback.
create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  email text not null check (char_length(email) between 5 and 200),
  source text check (char_length(source) <= 60),
  invited_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists waitlist_email_key on public.waitlist (lower(email));
alter table public.waitlist enable row level security;

drop policy if exists "admin reads waitlist" on public.waitlist;
create policy "admin reads waitlist" on public.waitlist for select to authenticated using (public.is_admin());
drop policy if exists "admin updates waitlist" on public.waitlist;
create policy "admin updates waitlist" on public.waitlist for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin deletes waitlist" on public.waitlist;
create policy "admin deletes waitlist" on public.waitlist for delete to authenticated using (public.is_admin());

-- Anyone may join, only through this function (no direct insert). Returns 'ok' or 'exists'.
create or replace function public.waitlist_join(p_name text, p_email text, p_source text default null)
returns text language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(p_email)); n text := trim(p_name);
begin
  if n is null or char_length(n) < 1 or char_length(n) > 100 then raise exception 'bad name'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(e) > 200 then raise exception 'bad email'; end if;
  if (select count(*) from waitlist where created_at > now() - interval '1 hour') > 200 then raise exception 'busy'; end if;
  insert into waitlist (name, email, source) values (n, e, left(p_source, 60));
  return 'ok';
exception when unique_violation then
  return 'exists';
end $$;
revoke all on function public.waitlist_join(text, text, text) from public;
grant execute on function public.waitlist_join(text, text, text) to anon, authenticated;

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  email text,
  kind text not null default 'idea' check (kind in ('idea', 'bug', 'other')),
  page text check (char_length(page) <= 200),
  text text not null check (char_length(text) between 3 and 2000),
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;
drop policy if exists "send own feedback" on public.feedback;
create policy "send own feedback" on public.feedback for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "admin reads feedback" on public.feedback;
create policy "admin reads feedback" on public.feedback for select to authenticated using (public.is_admin());
drop policy if exists "admin updates feedback" on public.feedback;
create policy "admin updates feedback" on public.feedback for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin deletes feedback" on public.feedback;
create policy "admin deletes feedback" on public.feedback for delete to authenticated using (public.is_admin());
