-- Traderas REST API v4 allows 10,000 calls per method and 24 h (the old 100-call limit no longer applies).
-- Keep well under it: 5,000 for the whole service, 100 per user and 300 per admin. Cached answers do not count.
create or replace function public.tradera_reserve(p_key text) returns text
  language plpgsql security definer set search_path = ''
as $$
declare
  global_calls int;
  user_calls int;
  per_user int;
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  select count(*) into global_calls from public.tradera_calls where created_at > now() - interval '24 hours';
  if global_calls >= 5000 then return 'global_limit'; end if;
  per_user := case when public.is_admin() then 300 else 100 end;
  select count(*) into user_calls from public.tradera_calls where user_id = auth.uid() and created_at > now() - interval '24 hours';
  if user_calls >= per_user then return 'user_limit'; end if;
  insert into public.tradera_calls (user_id, key) values (auth.uid(), left(p_key, 200));
  return 'ok';
end
$$;
