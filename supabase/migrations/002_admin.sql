-- Admins and superusers, identified by confirmed e-mail address.
-- admin: manages the library (verify, rename, delete any set), sees the fetch log, no daily fetch limit.
-- superuser: everything an admin can, plus adding and removing admins.

create table public.admins (
  email text primary key check (email = lower(email)),
  role text not null default 'admin' check (role in ('admin', 'superuser')),
  added_at timestamptz not null default now()
);
alter table public.admins enable row level security;

-- Role of the signed-in user, only once their e-mail is confirmed (so nobody can sign up with an admin's address).
create function public.admin_role() returns text
  language sql stable security definer set search_path = ''
as $$
  select a.role from public.admins a
  join auth.users u on lower(u.email) = a.email
  where u.id = auth.uid() and u.email_confirmed_at is not null
$$;
create function public.is_admin() returns boolean
  language sql stable security definer set search_path = ''
as $$ select public.admin_role() is not null $$;
create function public.is_superuser() returns boolean
  language sql stable security definer set search_path = ''
as $$ select public.admin_role() = 'superuser' $$;

revoke execute on function public.admin_role(), public.is_admin(), public.is_superuser() from public, anon;
grant execute on function public.admin_role(), public.is_admin(), public.is_superuser() to authenticated;

-- Key numbers for the admin panel.
create function public.admin_overview() returns json
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
    'fetches_24h', (select count(*) from public.fetch_jobs where created_at > now() - interval '24 hours')
  );
end
$$;
revoke execute on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;

insert into public.admins (email, role) values ('richardthorsell@gmail.com', 'superuser');

create policy "admins readable by admins" on public.admins for select to authenticated using (public.is_admin());
create policy "admins managed by superusers" on public.admins for all to authenticated
  using (public.is_superuser()) with check (public.is_superuser());

create policy "sets admin" on public.sets for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "sections admin" on public.sections for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "cards admin" on public.cards for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "jobs admin read" on public.fetch_jobs for select to authenticated using (public.is_admin());
