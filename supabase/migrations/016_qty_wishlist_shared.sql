-- Copies per card (duplicates), a wishlist, and shareable lists of missing cards / duplicates.

-- 1. Copies. qty = how many the user has; more than one means duplicates.
alter table public.owned add column if not exists qty int not null default 1 check (qty >= 1 and qty <= 999);
alter table public.owned_parallels add column if not exists qty int not null default 1 check (qty >= 1 and qty <= 999);
drop policy if exists "owned update own" on public.owned;
create policy "owned update own" on public.owned for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 2. Wishlist: cards the user is chasing, with a priority (1 high, 2 normal, 3 low), a maximum price in SEK and a note.
create table if not exists public.wishlist (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  card_id bigint not null references public.cards(id) on delete cascade,
  set_id text not null references public.sets(id) on delete cascade,
  priority smallint not null default 2 check (priority between 1 and 3),
  max_price numeric(10,2) check (max_price is null or max_price >= 0),
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  primary key (user_id, card_id)
);
create index if not exists wishlist_user_idx on public.wishlist (user_id, priority);
alter table public.wishlist enable row level security;
drop policy if exists "wishlist read own" on public.wishlist;
create policy "wishlist read own" on public.wishlist for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "wishlist insert own" on public.wishlist;
create policy "wishlist insert own" on public.wishlist for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "wishlist update own" on public.wishlist;
create policy "wishlist update own" on public.wishlist for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "wishlist delete own" on public.wishlist;
create policy "wishlist delete own" on public.wishlist for delete to authenticated using (user_id = (select auth.uid()));

-- 3. Shared lists: a link anyone can open. It shows only the card list for one set, no name or e-mail, and can be switched off.
create table if not exists public.shared_lists (
  token text primary key default substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 24),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  set_id text not null references public.sets(id) on delete cascade,
  kind text not null check (kind in ('missing', 'dups')),
  created_at timestamptz not null default now(),
  unique (user_id, set_id, kind)
);
alter table public.shared_lists enable row level security;
drop policy if exists "shared read own" on public.shared_lists;
create policy "shared read own" on public.shared_lists for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "shared insert own" on public.shared_lists;
create policy "shared insert own" on public.shared_lists for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "shared delete own" on public.shared_lists;
create policy "shared delete own" on public.shared_lists for delete to authenticated using (user_id = (select auth.uid()));

-- The public view of a shared list, computed live from the owner's collection.
create or replace function public.shared_list(p_token text)
returns jsonb language plpgsql security definer set search_path = '' stable as $$
declare l public.shared_lists; sname text; items jsonb;
begin
  select * into l from public.shared_lists where token = p_token;
  if not found then return null; end if;
  select name into sname from public.sets where id = l.set_id;
  if l.kind = 'missing' then
    select coalesce(jsonb_agg(jsonb_build_object('delset', x.name, 'kod', x.code, 'nr', c.no, 'namn', c.name, 'lag', c.team) order by x.position, c.no), '[]'::jsonb) into items
    from public.cards c join public.sections x on x.id = c.section_id
    where c.set_id = l.set_id and not exists (select 1 from public.owned o where o.user_id = l.user_id and o.card_id = c.id);
  else
    select coalesce(jsonb_agg(r order by (r->>'pos')::int, (r->>'nr')::int), '[]'::jsonb) into items from (
      select jsonb_build_object('pos', x.position, 'delset', x.name, 'kod', x.code, 'nr', c.no, 'namn', c.name, 'lag', c.team, 'parallell', null, 'extra', o.qty - 1) r
      from public.owned o join public.cards c on c.id = o.card_id join public.sections x on x.id = c.section_id
      where o.user_id = l.user_id and o.set_id = l.set_id and o.qty > 1
      union all
      select jsonb_build_object('pos', x.position, 'delset', x.name, 'kod', x.code, 'nr', c.no, 'namn', c.name, 'lag', c.team, 'parallell', p.name || coalesce(' /' || p.print_run, ''), 'extra', op.qty - 1)
      from public.owned_parallels op join public.cards c on c.id = op.card_id join public.sections x on x.id = c.section_id join public.parallels p on p.id = op.parallel_id
      where op.user_id = l.user_id and op.set_id = l.set_id and op.qty > 1
    ) q;
  end if;
  return jsonb_build_object('set', sname, 'typ', l.kind, 'skapad', l.created_at, 'rader', items);
end $$;
revoke all on function public.shared_list(text) from public;
grant execute on function public.shared_list(text) to anon, authenticated;

-- 4. Export and delete include the new data (the tables cascade on account deletion).
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
    'forslag_pa_set', (select coalesce(jsonb_agg(jsonb_build_object('forslag', q.query, 'status', q.status, 'skickat', q.created_at)), '[]'::jsonb) from public.set_suggestions q where q.user_id = uid),
    'feedback', (select coalesce(jsonb_agg(jsonb_build_object('typ', b.kind, 'text', b.text, 'skickat', b.created_at)), '[]'::jsonb) from public.feedback b where b.user_id = uid),
    'introduktion', (select to_jsonb(us) - 'user_id' from public.user_state us where us.user_id = uid),
    'vantelista', (select coalesce(jsonb_agg(jsonb_build_object('namn', w.name, 'e_post', w.email, 'anmald', w.created_at, 'inbjuden', w.invited_at)), '[]'::jsonb) from public.waitlist w where lower(w.email) = lower(mail))
  );
end $$;
revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
