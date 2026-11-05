-- Invite-only beta: new accounts can only be created for admins and for waitlist entries that have been invited.
create or replace function public.signup_allowed(p_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where lower(email) = lower(p_email))
      or exists (select 1 from public.waitlist where lower(email) = lower(p_email) and invited_at is not null);
$$;
revoke all on function public.signup_allowed(text) from public, anon, authenticated;

create or replace function public.enforce_invite_only()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.signup_allowed(new.email) then
    raise exception 'not_invited';
  end if;
  return new;
end $$;
revoke all on function public.enforce_invite_only() from public, anon, authenticated;

drop trigger if exists enforce_invite_only on auth.users;
create trigger enforce_invite_only before insert on auth.users
  for each row execute function public.enforce_invite_only();

-- To open signups again: drop trigger enforce_invite_only on auth.users;
