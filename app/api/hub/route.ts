import { timingSafeEqual } from "node:crypto";
import { loadHubSnapshot } from "@/lib/hubstats";
import { adminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// Numbers for the Hub. Protected by HUB_TOKEN (Bearer) instead of a login, and closed completely when the token is missing or
// shorter than 32 characters. Answers with counts only.
export async function GET(request: Request) {
  const token = process.env.HUB_TOKEN?.trim();
  const given = request.headers.get("authorization") || "";
  if (!token || token.length < 32 || !same(given, `Bearer ${token}`)) {
    return Response.json({ error: "forbidden" }, { status: 401 });
  }
  const admin = adminClient();
  if (!admin) return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 503 });
  try {
    return Response.json(await loadHubSnapshot(admin), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Hub: could not load numbers", error);
    return Response.json({ error: "could not load numbers" }, { status: 500 });
  }
}
