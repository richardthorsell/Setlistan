# Setlistan

Sök fram checklistor för samlarkort, pricka av korten du har och se vilka som saknas.

Live: https://setlistan.vercel.app

## Teknik
- Next.js 15 (App Router) på Vercel
- Supabase: databas, inloggning (lösenord eller e-postlänk) och radnivåsäkerhet
- Claude API (`app/api/fetch/route.ts`): letar upp och sparar nya checklistor med webbsök och webbhämtning

## Databas
- `supabase/migrations/001_init.sql`: set, delset, kort, samling per användare, hämtlogg
- `supabase/migrations/002_admin.sql`: roller (`admin`, `superuser`) via tabellen `admins`

## Miljövariabler (Vercel)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publik nyckel)
- `ANTHROPIC_API_KEY` (hemlig, bara på servern)
