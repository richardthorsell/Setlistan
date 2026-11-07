import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 20;

// Sold items from Traderas REST API v4 (beta): POST /v4/search/advanced with itemStatus "Ended".
// Tradera allows 10,000 calls per method and 24 h. Results are cached for 72 h (TTL_MS) and every call is reserved
// against a per-user and a global quota in the database (see tradera_reserve) to keep abuse bounded.
const URL_ADVANCED = "https://api.tradera.com/v4/search/advanced";
const TTL_MS = 72 * 3600 * 1000; // answers are reused for three days: fewer calls to Tradera
const PAGE_SIZE = 40;
const SHOW = 12;

type Item = { id: string; title: string; price: number | null; buyNow: number | null; bids: number | null; ends: string; url: string; thumb: string };
type Stats = { count: number; median: number | null; min: number | null; max: number | null };

const host = (u: string) => {
  try {
    return new URL(u).hostname;
  } catch {
    return "";
  }
};
const isTradera = (u: string) => {
  const h = host(u);
  return h === "tradera.com" || h.endsWith(".tradera.com");
};
const isTraderaImage = (u: string) => u.startsWith("https://") && (isTradera(u) || host(u).endsWith(".tradera.net"));
const nz = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// An ended auction with at least one bid was sold. Ended listings without bids are unsold or fixed-price
// listings, which cannot be told apart, so they are left out.
function sold(raw: unknown): { all: number; items: Item[] } {
  const list: unknown[] = Array.isArray(raw) ? raw : [];
  const all = list.map((r) => {
    const x = (r || {}) as Record<string, unknown>;
    return {
      id: String(x.id ?? ""),
      title: String(x.shortDescription ?? ""),
      price: nz(x.maxBid),
      buyNow: nz(x.buyItNowPrice),
      bids: nz(x.bidCount),
      ends: String(x.endDate ?? ""),
      url: String(x.itemUrl ?? ""),
      thumb: String(x.thumbnailLink ?? ""),
    } as Item;
  });
  return { all: all.length, items: all.filter((i) => (i.bids ?? 0) > 0 && (i.price ?? 0) > 0) };
}

function statsOf(items: Item[]): Stats {
  const p = items
    .map((i) => i.price)
    .filter((x): x is number => typeof x === "number" && x > 0)
    .sort((a, b) => a - b);
  if (!p.length) return { count: 0, median: null, min: null, max: null };
  const mid = Math.floor(p.length / 2);
  return { count: p.length, median: p.length % 2 ? p[mid] : Math.round((p[mid - 1] + p[mid]) / 2), min: p[0], max: p[p.length - 1] };
}

// Whatever is stored in the shared cache is untrusted: only allow links and images on Tradera's own domains.
function clean(items: unknown, searchUrl: string): Item[] {
  if (!Array.isArray(items)) return [];
  return items.slice(0, SHOW).map((i) => {
    const it = (i || {}) as Partial<Item>;
    return {
      id: String(it.id || "").slice(0, 40),
      title: String(it.title || "").slice(0, 200),
      price: nz(it.price),
      buyNow: nz(it.buyNow),
      bids: nz(it.bids),
      ends: String(it.ends || "").slice(0, 40),
      url: isTradera(String(it.url || "")) ? String(it.url) : searchUrl,
      thumb: isTraderaImage(String(it.thumb || "")) ? String(it.thumb) : "",
    };
  });
}
function cleanStats(s: unknown): Stats {
  const x = (s || {}) as Partial<Stats>;
  return { count: nz(x.count) ?? 0, median: nz(x.median), min: nz(x.min), max: nz(x.max) };
}

type Admin = ReturnType<typeof adminClient>;

// Every search is logged without any user information: only the query, what it was about (set and card) and the result.
// Written with the service role (users cannot call the log functions); skipped when the key is not configured.
async function logSearch(db: Admin, key: string, ctx: string, stats: Stats, seen: number, total: number, cached: boolean) {
  if (!db) return;
  await db.rpc("tradera_log", { p_key: key, p_ctx: ctx, p_seen: seen, p_total: total, p_sold: stats.count, p_median: stats.median, p_min: stats.min, p_max: stats.max, p_cached: cached });
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const q = (params.get("q") || "").trim().slice(0, 100);
  const ctx = (params.get("ctx") || "").trim().slice(0, 200);
  if (q.length < 3) return Response.json({ error: "Skriv minst tre tecken." }, { status: 400 });
  // Traderas own search page, which lists what is for sale right now.
  const searchUrl = "https://www.tradera.com/search?q=" + encodeURIComponent(q);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Logga in för att se sålda kort härifrån.", searchUrl }, { status: 401 });

  // Cache, history and search log are written with the service role so that signed-in users cannot forge them.
  const admin = adminClient();
  if (!admin) console.warn("tradera: SUPABASE_SERVICE_ROLE_KEY is not set, so results are not cached, stored or logged");

  const key = "sold:" + q.toLowerCase().split(" ").filter(Boolean).join(" ");
  const { data: cached } = await supabase.from("tradera_cache").select("total, items, fetched_at").eq("key", key).maybeSingle();
  // A stored answer of any age; used fresh (within the TTL) or as a fallback when Tradera cannot be reached.
  const fromCache = async (stale: boolean) => {
    if (!cached || Array.isArray(cached.items)) return null;
    const p = cached.items as { items?: unknown; stats?: unknown; seen?: unknown };
    const stats = cleanStats(p.stats);
    const seen = nz(p.seen) ?? 0;
    await logSearch(admin, key, ctx, stats, seen, cached.total, true);
    return Response.json({ items: clean(p.items, searchUrl), stats, seen, total: cached.total, cached: true, stale, searchUrl });
  };
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < TTL_MS) {
    const r = await fromCache(false);
    if (r) return r;
  }

  const appId = process.env.TRADERA_APP_ID?.trim();
  const appKey = process.env.TRADERA_APP_KEY?.trim();
  if (!appId || !appKey) return Response.json({ error: "Traderas API är inte kopplat än.", searchUrl }, { status: 503 });
  // The app id is a whole number and the app key a GUID. Say so if they look wrong or swapped (the values are never shown).
  if (!/^\d+$/.test(appId)) return Response.json({ error: "TRADERA_APP_ID i Vercel ska vara bara siffror (AppId). Kontrollera att AppId och nyckel inte är ombytta.", searchUrl }, { status: 500 });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(appKey)) return Response.json({ error: "TRADERA_APP_KEY i Vercel ska vara en GUID, till exempel aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.", searchUrl }, { status: 500 });

  const { data: slot } = await supabase.rpc("tradera_reserve", { p_key: key });
  if (slot === "user_limit") return (await fromCache(true)) ?? Response.json({ error: "Du har gjort dina Tradera-sökningar för idag.", searchUrl }, { status: 429 });
  if (slot === "global_limit") return (await fromCache(true)) ?? Response.json({ error: "Tjänstens dagliga Tradera-kvot är slut. Försök igen i morgon.", searchUrl }, { status: 429 });
  if (slot !== "ok") return Response.json({ error: "Kunde inte söka just nu.", searchUrl }, { status: 500 });

  let res: Response;
  try {
    res = await fetch(URL_ADVANCED, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-App-Id": appId, "X-App-Key": appKey },
      body: JSON.stringify({
        searchWords: q,
        categoryId: 0,
        mode: "And",
        itemStatus: "Ended",
        orderBy: "EndDateDescending",
        itemsPerPage: PAGE_SIZE,
        pageNumber: 1,
        searchInDescription: false,
      }),
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
  } catch {
    return (await fromCache(true)) ?? Response.json({ error: "Tradera svarade inte i tid.", searchUrl }, { status: 502 });
  }
  if (res.status === 429) return (await fromCache(true)) ?? Response.json({ error: "Traderas dagliga gräns är nådd. Försök igen i morgon.", searchUrl }, { status: 429 });
  if (res.status === 401 || res.status === 403) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    const why = String(body?.error?.message || "").slice(0, 120);
    console.error("tradera: credentials were not accepted", res.status, why);
    // Admins also see which AppId is used and how the key ends, to compare with the app at Tradera.
    const { data: role } = await supabase.rpc("admin_role");
    const hint = role ? ` Du använder AppId ${appId} och en nyckel som slutar på ${appKey.slice(-4)}. Jämför med din app hos Tradera.` : "";
    return Response.json({ error: `Traderas nycklar godkändes inte${why ? ` (Tradera säger: ${why})` : ""}.${hint}`, searchUrl }, { status: 502 });
  }
  if (!res.ok) return (await fromCache(true)) ?? Response.json({ error: `Tradera svarade med fel ${res.status}.`, searchUrl }, { status: 502 });

  const data = (await res.json().catch(() => null)) as { items?: unknown; totalNumberOfItems?: unknown; errors?: unknown } | null;
  if (!data) return Response.json({ error: "Svaret från Tradera gick inte att läsa.", searchUrl }, { status: 502 });
  if (Array.isArray(data.errors) && data.errors.length) console.error("tradera: errors in response", JSON.stringify(data.errors).slice(0, 300));

  const { all, items } = sold(data.items);
  const stats = statsOf(items);
  const shown = clean(items, searchUrl);
  const total = nz(data.totalNumberOfItems) ?? all;
  if (admin) {
    await admin.rpc("tradera_cache_put", { p_key: key, p_total: total, p_items: { items: shown, stats, seen: all } });
    // History: every sold auction once (by Tradera's own id) and the search itself, without any user information.
    await admin.rpc("tradera_store_auctions", { p_items: items });
  }
  await logSearch(admin, key, ctx, stats, all, total, false);
  return Response.json({ items: shown, stats, seen: all, total, cached: false, searchUrl });
}
