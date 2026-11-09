-- player_cards also returns the card's subset (section_id), so the player view can offer the right parallels per card.

drop function if exists public.player_cards(text);

create function public.player_cards(p_key text)
returns table (card_id bigint, set_id text, set_name text, sport text, section_id bigint, section_code text, section_name text, no integer, name text, team text, qty integer)
language sql stable set search_path = ''
as $$
  select c.id, c.set_id, s.name, s.sport, x.id, x.code, x.name, c.no, c.name, c.team,
         case when o.card_id is null then null else coalesce(o.qty, 1) end
  from public.cards c
  join public.sets s on s.id = c.set_id
  join public.sections x on x.id = c.section_id
  left join public.owned o on o.card_id = c.id and o.user_id = auth.uid()
  where char_length(p_key) >= 3
    and public.name_key(c.name) like '%' || replace(replace(replace(p_key, '\', '\\'), '%', '\%'), '_', '\_') || '%'
    and p_key = any (select btrim(part) from unnest(string_to_array(public.name_key(c.name), ' / ')) as part)
  order by s.name, x.position, c.no, c.id
  limit 3000
$$;

grant execute on function public.player_cards(text) to authenticated;
revoke execute on function public.player_cards(text) from anon, public;
