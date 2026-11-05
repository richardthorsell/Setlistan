-- Tradera quota: the app may make about 100 calls per 24 h in total, so keep 10 in reserve.
-- 90 for the whole service, 20 per user and 40 per admin. Cached answers do not count.
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
  if global_calls >= 90 then return 'global_limit'; end if;
  per_user := case when public.is_admin() then 40 else 20 end;
  select count(*) into user_calls from public.tradera_calls where user_id = auth.uid() and created_at > now() - interval '24 hours';
  if user_calls >= per_user then return 'user_limit'; end if;
  insert into public.tradera_calls (user_id, key) values (auth.uid(), left(p_key, 200));
  return 'ok';
end
$$;
