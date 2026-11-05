import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 20;

// Traderas public SOAP API (HTTP GET). Only 100 calls per 24 h are allowed for the whole app, so
// results are cached for 12 h and every call is reserved against a per-user and a global quota
// in the database (see tradera_reserve).
const BASE = "https://api.tradera.com/v3/searchservice.asmx/Search";
const TTL_MS = 12 * 3600 * 1000;
const MAX_ITEMS = 8;

type Item = { id: string; title: string; price: number | null; buyNow: number | null; bids: number | null; ends: string; url: string; thumb: string };

const decode = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp("<" + name + "(?: [^>]*)?>([^]*?)</" + name + ">", "i"));
  return m ? decode(m[1].trim()) : "";
};
const num = (s: string) => {
  const n = parseFloat(s.split(",").join("."));
  return Number.isFinite(n) ? n : null;
};
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

function parse(xml: string): { total: number; items: Item[] } {
  const items: Item[] = [];
  const re = new RegExp("<Item(?: [^>]*)?>([^]*?)</Item>", "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) && items.length < MAX_ITEMS) {
    const x = m[1];
    items.push({
      id: tag(x, "Id"),
      title: tag(x, "ShortDescription") || tag(x, "Title"),
      price: num(tag(x, "MaxBid")) ?? num(tag(x, "NextBid")),
      buyNow: num(tag(x, "BuyItNowPrice")),
      bids: num(tag(x, "TotalBids")),
      ends: tag(x, "EndDate"),
      url: tag(x, "ItemUrl"),
      thumb: tag(x, "ThumbnailLink"),
    });
  }
  return { total: parseInt(tag(xml, "TotalNumberOfItems"), 10) || items.length, items };
}

// Whatever is stored in the shared cache is untrusted: only allow links and images on Tradera's own domains.
function clean(items: unknown, searchUrl: string): Item[] {
  if (!Array.isArray(items)) return [];
  return items.slice(0, MAX_ITEMS).map((i) => {
    const it = (i || {}) as Partial<Item>;
    return {
      id: String(it.id || "").slice(0, 40),
      title: String(it.title || "").slice(0, 200),
      price: typeof it.price === "number" ? it.price : null,
      buyNow: typeof it.buyNow === "number" ? it.buyNow : null,
      bids: typeof it.bids === "number" ? it.bids : null,
      ends: String(it.ends || "").slice(0, 40),
      url: isTradera(String(it.url || "")) ? String(it.url) : searchUrl,
      thumb: isTraderaImage(String(it.thumb || "")) ? String(it.thumb) : "",
    };
  });
}

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, 100);
  if (q.length < 3) return Response.json({ error: "Skriv minst tre tecken." }, { status: 400 });
  const searchUrl = "https://www.tradera.com/search?q=" + encodeURIComponent(q);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Logga in för att söka på Tradera härifrån.", searchUrl }, { status: 401 });

  const key = q.toLowerCase().split(" ").filter(Boolean).join(" ");
  const { data: cached } = await supabase.from("tradera_cache").select("total, items, fetched_at").eq("key", key).maybeSingle();
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < TTL_MS) {
    return Response.json({ items: clean(cached.items, searchUrl), total: cached.total, cached: true, searchUrl });
  }

  const appId = process.env.TRADERA_APP_ID;
  const appKey = process.env.TRADERA_APP_KEY;
  if (!appId || !appKey) return Response.json({ error: "Traderas API är inte kopplat än.", searchUrl }, { status: 503 });

  const { data: slot } = await supabase.rpc("tradera_reserve", { p_key: key });
  if (slot === "user_limit") return Response.json({ error: "Du har gjort dina Tradera-sökningar för idag.", searchUrl }, { status: 429 });
  if (slot === "global_limit") return Response.json({ error: "Tjänstens dagliga Tradera-kvot är slut. Försök igen i morgon.", searchUrl }, { status: 429 });
  if (slot !== "ok") return Response.json({ error: "Kunde inte söka just nu.", searchUrl }, { status: 500 });

  const params = new URLSearchParams({ appId, appKey, query: q, categoryId: "0", pageNumber: "1", orderBy: "Relevance" });
  let res: Response;
  try {
    res = await fetch(`${BASE}?${params}`, { signal: AbortSignal.timeout(8000), cache: "no-store" });
  } catch {
    return Response.json({ error: "Tradera svarade inte i tid.", searchUrl }, { status: 502 });
  }
  if (res.status === 429) return Response.json({ error: "Traderas dagliga gräns är nådd. Försök igen i morgon.", searchUrl }, { status: 429 });
  if (!res.ok) return Response.json({ error: `Tradera svarade med fel ${res.status}.`, searchUrl }, { status: 502 });

  const xml = await res.text();
  const { total, items } = parse(xml);
  if (!items.length && total > 0) console.error("tradera: could not read any items from the response", xml.slice(0, 400));
  const safe = clean(items, searchUrl);
  await supabase.rpc("tradera_cache_put", { p_key: key, p_total: total, p_items: safe });
  return Response.json({ items: safe, total, cached: false, searchUrl });
}
