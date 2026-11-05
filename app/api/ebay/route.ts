import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 20;

// Running eBay auctions that already have bids, from eBay's Browse API (item_summary/search, filter AUCTION).
// The Browse API only covers listings that are live now, so these are current prices, not sold prices.
// Needs EBAY_APP_ID and EBAY_CERT_ID in the environment. EBAY_MARKETPLACE is optional (default EBAY_US).
const API = "https://api.ebay.com";
const SHOW = 20;
const FETCH = 100;

type Item = { id: string; title: string; price: number | null; currency: string; bids: number; ends: string; url: string; thumb: string };

let token: { value: string; exp: number } | null = null;

const nz = (v: unknown) => {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const host = (u: string) => {
  try {
    return new URL(u).hostname;
  } catch {
    return "";
  }
};
const isEbay = (u: string) => u.startsWith("https://") && (host(u) === "ebay.com" || host(u).endsWith(".ebay.com") || host(u).endsWith(".ebay.co.uk") || host(u).endsWith(".ebay.de") || host(u).endsWith(".ebay.se"));
const isEbayImage = (u: string) => u.startsWith("https://") && (host(u).endsWith(".ebayimg.com") || host(u).endsWith(".ebaystatic.com"));

async function getToken(id: string, secret: string): Promise<string | null> {
  if (token && token.exp > Date.now() + 60_000) return token.value;
  const res = await fetch(`${API}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64") },
    body: "grant_type=client_credentials&scope=" + encodeURIComponent("https://api.ebay.com/oauth/api_scope"),
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  if (!res.ok) {
    console.error("ebay: token request failed", res.status);
    return null;
  }
  const j = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null;
  if (!j?.access_token) return null;
  token = { value: j.access_token, exp: Date.now() + (j.expires_in ?? 7200) * 1000 };
  return token.value;
}

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, 100);
  if (q.length < 3) return Response.json({ error: "Skriv minst tre tecken." }, { status: 400 });
  const searchUrl = "https://www.ebay.com/sch/i.html?_nkw=" + encodeURIComponent(q) + "&LH_Auction=1&_sop=1";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Logga in för att se auktioner här.", searchUrl }, { status: 401 });

  const id = process.env.EBAY_APP_ID?.trim();
  const secret = process.env.EBAY_CERT_ID?.trim();
  if (!id || !secret) return Response.json({ error: "eBay är inte kopplat än.", searchUrl }, { status: 503 });

  let tok: string | null;
  try {
    tok = await getToken(id, secret);
  } catch {
    return Response.json({ error: "eBay svarade inte i tid.", searchUrl }, { status: 502 });
  }
  if (!tok) return Response.json({ error: "eBays nycklar godkändes inte.", searchUrl }, { status: 502 });

  const url = `${API}/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&filter=${encodeURIComponent("buyingOptions:{AUCTION}")}&sort=endingSoonest&limit=${FETCH}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${tok}`, "X-EBAY-C-MARKETPLACE-ID": process.env.EBAY_MARKETPLACE?.trim() || "EBAY_US" },
      signal: AbortSignal.timeout(10000),
      next: { revalidate: 600 },
    });
  } catch {
    return Response.json({ error: "eBay svarade inte i tid.", searchUrl }, { status: 502 });
  }
  if (res.status === 401) token = null;
  if (res.status === 429) return Response.json({ error: "eBays dagliga gräns är nådd. Försök igen senare.", searchUrl }, { status: 429 });
  if (!res.ok) return Response.json({ error: `eBay svarade med fel ${res.status}.`, searchUrl }, { status: 502 });

  const data = (await res.json().catch(() => null)) as { itemSummaries?: unknown; total?: unknown } | null;
  const list: unknown[] = Array.isArray(data?.itemSummaries) ? (data!.itemSummaries as unknown[]) : [];
  const all: Item[] = list.map((r) => {
    const x = (r || {}) as Record<string, any>;
    const link = String(x.itemWebUrl || "");
    const img = String(x.thumbnailImages?.[0]?.imageUrl || x.image?.imageUrl || "");
    return {
      id: String(x.itemId || "").slice(0, 60),
      title: String(x.title || "").slice(0, 200),
      price: nz(x.currentBidPrice?.value ?? x.price?.value),
      currency: String(x.currentBidPrice?.currency || x.price?.currency || "").slice(0, 3),
      bids: nz(x.bidCount) ?? 0,
      ends: String(x.itemEndDate || "").slice(0, 40),
      url: isEbay(link) ? link : searchUrl,
      thumb: isEbayImage(img) ? img : "",
    };
  });
  const withBids = all.filter((i) => i.bids > 0);
  return Response.json({ items: withBids.slice(0, SHOW), seen: all.length, withBids: withBids.length, total: nz(data?.total) ?? all.length, searchUrl });
}
