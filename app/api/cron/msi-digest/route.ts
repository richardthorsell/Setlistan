import { timingSafeEqual } from "node:crypto";
import { adminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type T = { kind: string; set_text: string; year: number | null; users: number; cards: number; priority: number };

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// The weekly e-mail with the open Missing Set Intelligence tickets, sent to the superusers. Vercel calls this on the schedule in vercel.json
// and sends "Authorization: Bearer <CRON_SECRET>"; without the secret set, or with another one, nothing happens.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const given = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!secret || !given || !same(given, secret)) return Response.json({ error: "forbidden" }, { status: 403 });

  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();
  const admin = adminClient();
  if (!key || !from || !admin) return Response.json({ error: "not configured" }, { status: 503 });

  const { data, error } = await admin.rpc("msi_digest_data");
  if (error || !data) return Response.json({ error: "no data" }, { status: 500 });
  const { tickets, to } = data as { tickets: T[]; to: string[] };
  if (!tickets.length || !to.length) return Response.json({ sent: 0, reason: "nothing to send" });

  const lines = tickets.slice(0, 40).map((t) => `${Number(t.priority).toFixed(1)}  ${t.kind === "set" ? "Set saknas" : "Kort saknas i"}: ${t.set_text}${t.year ? ` (${t.year})` : ""} – ${t.users} användare, ${t.cards} kort`);
  const text = `Saknade set och kort i Setlistan (${tickets.length} öppna)\n\n${lines.join("\n")}\n\nÖppna https://setlistan.se/admin#saknade för att hantera dem.`;
  let sent = 0;
  for (const addr of to) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [addr], subject: `Saknade set och kort (${tickets.length} öppna)`, text }),
    });
    if (r.ok) sent++;
  }
  return Response.json({ sent });
}
