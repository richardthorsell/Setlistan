-- Rate limit for the public waitlist form: at most five attempts per visitor and hour.
-- The visitor is identified by a hash that changes every day (computed in the API route); no IP address is stored.
-- Only the service role can call the function, so nobody can fill the table directly.

create table if not exists public.waitlist_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null check (char_length(ip_hash) = 64),
  created_at timestamptz not null default now()
);
create index if not exists waitlist_attempts_hash_idx on public.waitlist_attempts (ip_hash, created_at);
alter table public.waitlist_attempts enable row level security;
revoke all on public.waitlist_attempts from anon, authenticated;

create or replace function public.waitlist_rate_ok(p_ip_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  delete from public.waitlist_attempts where created_at < now() - interval '24 hours';
  select count(*) into n from public.waitlist_attempts where ip_hash = p_ip_hash and created_at > now() - interval '1 hour';
  if n >= 5 then return false; end if;
  insert into public.waitlist_attempts (ip_hash) values (p_ip_hash);
  return true;
end $$;

revoke all on function public.waitlist_rate_ok(text) from public, anon, authenticated;
grant execute on function public.waitlist_rate_ok(text) to service_role;
