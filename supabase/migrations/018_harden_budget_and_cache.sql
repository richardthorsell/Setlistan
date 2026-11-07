-- Hardening after code review.
-- 1. fetch_jobs: users could insert/update their own rows (including cost_usd) and so exhaust the shared monthly budget.
--    Rows are now written only through admin-only functions.
-- 2. Tradera cache, auction history and search log: any signed-in user could call the write functions directly and
--    forge what other users see. Writes now go through the service role (the API route), not through user sessions.
-- 3. export_my_data: add followed players and fetch history (personal data that was missing from the export).
--
-- Deploy order: apply this migration BEFORE deploying the matching app code, and set SUPABASE_SERVICE_ROLE_KEY in Vercel.
-- Without that key the Tradera route still answers, it just does not cache, store history or log until the key is set.

-- 1. fetch_jobs ------------------------------------------------------------------------------------------------------

drop policy if exists "jobs insert own" on public.fetch_jobs;
drop policy if exists "jobs update own" on public.fetch_jobs;
revoke insert, update, delete on public.fetch_jobs from anon, authenticated;

create or replace function public.fetch_job_start(p_query text, p_set_id text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare jid bigint;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  insert into public.fetch_jobs (user_id, query, set_id)
  values (auth.uid(), left(coalesce(p_query, ''), 300), left(coalesce(p_set_id, ''), 200))
  returning id into jid;
  return jid;
end $$;

-- Cost per job is capped well above the app's own per-job limit, so a bug cannot blow up the monthly sum either.
create or replace function public.fetch_job_finish(p_id bigint, p_status text, p_error text, p_in int, p_out int, p_cost numeric)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  update public.fetch_jobs
     set status = case when p_status in ('done', 'failed') then p_status else 'failed' end,
         error = left(p_error, 500),
         input_tokens = greatest(coalesce(p_in, 0), 0),
         output_tokens = greatest(coalesce(p_out, 0), 0),
         cost_usd = least(greatest(coalesce(p_cost, 0), 0), 5)
   where id = p_id and user_id = auth.uid();
end $$;

revoke all on function public.fetch_job_start(text, text), public.fetch_job_finish(bigint, text, text, int, int, numeric) from public, anon;
grant execute on function public.fetch_job_start(text, text), public.fetch_job_finish(bigint, text, text, int, int, numeric) to authenticated;

-- 2. Tradera writes: service role only ----------------------------------------------------------------------------------

create or replace function public.tradera_cache_put(p_key text, p_total int, p_items jsonb) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.tradera_cache (key, total, items, fetched_at) values (left(p_key, 200), p_total, p_items, now())
  on conflict (key) do update set total = excluded.total, items = excluded.items, fetched_at = excluded.fetched_at;
end
$$;

create or replace function public.tradera_log(p_key text, p_ctx text, p_seen int, p_total int, p_sold int, p_median int, p_min int, p_max int, p_cached boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.tradera_searches (key, ctx, seen, total, sold, median, min_price, max_price, from_cache)
  values (left(p_key, 200), left(coalesce(p_ctx, ''), 200), greatest(coalesce(p_seen, 0), 0), greatest(coalesce(p_total, 0), 0), greatest(coalesce(p_sold, 0), 0), p_median, p_min, p_max, coalesce(p_cached, false));
end $$;

create or replace function public.tradera_store_auctions(p_items jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare r jsonb; n integer := 0; ends timestamptz;
begin
  if jsonb_typeof(p_items) <> 'array' then return 0; end if;
  for r in select * from jsonb_array_elements(p_items) limit 40 loop
    if coalesce(r->>'id', '') !~ '^[0-9]{1,20}$' then continue; end if;
    if coalesce(r->>'url', '') !~ '^https://([a-z0-9-]+\.)?tradera\.com/' then continue; end if;
    if coalesce((r->>'price')::numeric, 0) <= 0 then continue; end if;
    begin ends := (r->>'ends')::timestamptz; exception when others then ends := null; end;
    insert into public.tradera_auctions (item_id, title, price, bids, ends_at, url, thumb)
    values (r->>'id', left(coalesce(r->>'title', ''), 200), round((r->>'price')::numeric)::int, nullif(r->>'bids', '')::int, ends, left(r->>'url', 400),
            case when coalesce(r->>'thumb', '') ~ '^https://' then left(r->>'thumb', 400) else '' end)
    on conflict (item_id) do update set last_seen = now();
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function public.tradera_cache_put(text, int, jsonb), public.tradera_log(text, text, int, int, int, int, int, int, boolean), public.tradera_store_auctions(jsonb)
  from public, anon, authenticated;
grant execute on function public.tradera_cache_put(text, int, jsonb), public.tradera_log(text, text, int, int, int, int, int, int, boolean), public.tradera_store_auctions(jsonb)
  to service_role;

-- 3. Export: followed players and fetch history ---------------------------------------------------------------------------

create or replace function public.export_my_data()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); mail text;
begin
  if uid is null then raise exception 'not allowed'; end if;
  select email into mail from auth.users where id = uid;
  return jsonb_build_object(
    'exporterad', now(),
    'konto', (select jsonb_build_object('e_post', u.email, 'skapad', u.created_at, 'senast_inloggad', u.last_sign_in_at) from auth.users u where u.id = uid),
    'avprickade_kort', (select coalesce(jsonb_agg(jsonb_build_object('set', s.name, 'delset', x.name, 'nummer', c.no, 'namn', c.name, 'lag', c.team, 'antal', o.qty, 'markerad', o.created_at) order by s.name, x.position, c.no), '[]'::jsonb)
      from public.owned o join public.cards c on c.id = o.card_id join public.sections x on x.id = c.section_id join public.sets s on s.id = o.set_id where o.user_id = uid),
    'avprickade_paralleller', (select coalesce(jsonb_agg(jsonb_build_object('set', s.name, 'delset', x.name, 'nummer', c.no, 'namn', c.name, 'parallell', p.name, 'upplaga', p.print_run, 'serienummer', op.serial, 'antal', op.qty) order by s.name, x.position, c.no), '[]'::jsonb)
      from public.owned_parallels op join public.cards c on c.id = op.card_id join public.sections x on x.id = c.section_id join public.sets s on s.id = op.set_id join public.parallels p on p.id = op.parallel_id where op.user_id = uid),
    'onskelista', (select coalesce(jsonb_agg(jsonb_build_object('set', s.name, 'nummer', c.no, 'namn', c.name, 'prioritet', w.priority, 'maxpris_kr', w.max_price, 'anteckning', w.note, 'sparad', w.created_at)), '[]'::jsonb)
      from public.wishlist w join public.cards c on c.id = w.card_id join public.sets s on s.id = w.set_id where w.user_id = uid),
    'delade_listor', (select coalesce(jsonb_agg(jsonb_build_object('set', s.name, 'typ', sl.kind, 'skapad', sl.created_at)), '[]'::jsonb) from public.shared_lists sl join public.sets s on s.id = sl.set_id where sl.user_id = uid),
    'favoritalbum', (select coalesce(jsonb_agg(jsonb_build_object('set', s.name, 'sparad', f.created_at)), '[]'::jsonb) from public.favorites f join public.sets s on s.id = f.set_id where f.user_id = uid),
    'favoritkort', (select coalesce(jsonb_agg(jsonb_build_object('set', s.name, 'nummer', c.no, 'namn', c.name, 'sparad', fc.created_at)), '[]'::jsonb)
      from public.favorite_cards fc join public.cards c on c.id = fc.card_id join public.sets s on s.id = fc.set_id where fc.user_id = uid),
    'foljda_spelare', (select coalesce(jsonb_agg(jsonb_build_object('namn', fp.display_name, 'sparad', fp.created_at)), '[]'::jsonb) from public.favorite_players fp where fp.user_id = uid),
    'forslag_pa_set', (select coalesce(jsonb_agg(jsonb_build_object('forslag', q.query, 'status', q.status, 'skickat', q.created_at)), '[]'::jsonb) from public.set_suggestions q where q.user_id = uid),
    'hamtningar', (select coalesce(jsonb_agg(jsonb_build_object('sokning', j.query, 'status', j.status, 'tid', j.created_at)), '[]'::jsonb) from public.fetch_jobs j where j.user_id = uid),
    'feedback', (select coalesce(jsonb_agg(jsonb_build_object('typ', b.kind, 'text', b.text, 'skickat', b.created_at)), '[]'::jsonb) from public.feedback b where b.user_id = uid),
    'introduktion', (select to_jsonb(us) - 'user_id' from public.user_state us where us.user_id = uid),
    'vantelista', (select coalesce(jsonb_agg(jsonb_build_object('namn', w.name, 'e_post', w.email, 'anmald', w.created_at, 'inbjuden', w.invited_at)), '[]'::jsonb) from public.waitlist w where lower(w.email) = lower(mail))
  );
end $$;
revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
