-- GDPR: consent timestamp on the waitlist, export of a user's own data, and account deletion.

alter table public.waitlist add column if not exists consented_at timestamptz default now();

-- Everything stored about the signed-in user, as one JSON document (right of access and data portability).
create or replace function public.export_my_data()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); mail text;
begin
  if uid is null then raise exception 'not allowed'; end if;
  select email into mail from auth.users where id = uid;
  return jsonb_build_object(
    'exporterad', now(),
    'konto', (select jsonb_build_object('e_post', u.email, 'skapad', u.created_at, 'senast_inloggad', u.last_sign_in_at) from auth.users u where u.id = uid),
    'avprickade_kort', (select coalesce(jsonb_agg(jsonb_build_object('set', s.name, 'delset', x.name, 'nummer', c.no, 'namn', c.name, 'lag', c.team, 'markerad', o.created_at) order by s.name, x.position, c.no), '[]'::jsonb)
      from public.owned o join public.cards c on c.id = o.card_id join public.sections x on x.id = c.section_id join public.sets s on s.id = o.set_id where o.user_id = uid),
    'avprickade_paralleller', (select coalesce(jsonb_agg(jsonb_build_object('set', s.name, 'delset', x.name, 'nummer', c.no, 'namn', c.name, 'parallell', p.name, 'upplaga', p.print_run, 'serienummer', op.serial) order by s.name, x.position, c.no), '[]'::jsonb)
      from public.owned_parallels op join public.cards c on c.id = op.card_id join public.sections x on x.id = c.section_id join public.sets s on s.id = op.set_id join public.parallels p on p.id = op.parallel_id where op.user_id = uid),
    'favoritalbum', (select coalesce(jsonb_agg(jsonb_build_object('set', s.name, 'sparad', f.created_at)), '[]'::jsonb) from public.favorites f join public.sets s on s.id = f.set_id where f.user_id = uid),
    'favoritkort', (select coalesce(jsonb_agg(jsonb_build_object('set', s.name, 'nummer', c.no, 'namn', c.name, 'sparad', fc.created_at)), '[]'::jsonb)
      from public.favorite_cards fc join public.cards c on c.id = fc.card_id join public.sets s on s.id = fc.set_id where fc.user_id = uid),
    'forslag_pa_set', (select coalesce(jsonb_agg(jsonb_build_object('forslag', q.query, 'status', q.status, 'skickat', q.created_at)), '[]'::jsonb) from public.set_suggestions q where q.user_id = uid),
    'feedback', (select coalesce(jsonb_agg(jsonb_build_object('typ', b.kind, 'text', b.text, 'skickat', b.created_at)), '[]'::jsonb) from public.feedback b where b.user_id = uid),
    'introduktion', (select to_jsonb(us) - 'user_id' from public.user_state us where us.user_id = uid),
    'vantelista', (select coalesce(jsonb_agg(jsonb_build_object('namn', w.name, 'e_post', w.email, 'anmald', w.created_at, 'inbjuden', w.invited_at)), '[]'::jsonb) from public.waitlist w where lower(w.email) = lower(mail))
  );
end $$;

-- Delete the signed-in user and everything tied to them. Administrators cannot do this themselves.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); mail text;
begin
  if uid is null then raise exception 'not allowed'; end if;
  if public.is_admin() then raise exception 'admin accounts are removed by another superuser'; end if;
  select email into mail from auth.users where id = uid;
  delete from public.tradera_calls where user_id = uid;
  delete from public.waitlist where lower(email) = lower(mail);
  -- owned, owned_parallels, favorites, favorite_cards, feedback, set_suggestions, user_state and fetch_jobs cascade; sets they added stay without an owner.
  delete from auth.users where id = uid;
end $$;

revoke all on function public.export_my_data() from public, anon;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.export_my_data() to authenticated;
grant execute on function public.delete_my_account() to authenticated;
