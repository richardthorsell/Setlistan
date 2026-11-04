-- Every set belongs to a sport, so the library can be browsed per sport.

alter table public.sets add column sport text not null default 'ovrigt'
  check (sport in ('fotboll', 'ishockey', 'basket', 'amerikansk-fotboll', 'baseboll', 'motorsport', 'tennis', 'golf', 'kampsport', 'ovrigt'));

update public.sets set sport = 'fotboll' where id in ('topps-pl-flagship-2026-27', 'futera-world-football-fx3-2026');

create or replace view public.set_stats with (security_invoker = true) as
  select s.id, s.name, s.short_name, s.keywords, s.source, s.notes, s.verified, s.status, s.created_by, s.created_at,
         (select count(*) from public.cards c where c.set_id = s.id)::int as card_count,
         (select count(*) from public.sections x where x.set_id = s.id)::int as section_count,
         s.sport
  from public.sets s;
