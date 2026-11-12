import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type T = { kind: string; set_text: string; year: number | null; users: number; cards: number; priority: number; status: string };

// Sends the open tickets of Missing Set Intelligence to the superuser's own e-mail address.
export async function POST() {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();
  if (!key || !from) return Response.json({ error: "not configured" }, { status: 503 });
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user?.email) return Response.json({ error: "forbidden" }, { status: 403 });
  const { data, error } = await supabase.rpc("msi_tickets"); // refuses anyone who is not a superuser
  if (error) return Response.json({ error: "forbidden" }, { status: 403 });
  const open = ((data as T[]) || []).filter((t) => t.status === "ny" || t.status === "granskas").slice(0, 40);
  const lines = open.length
    ? open.map((t) => `${Number(t.priority).toFixed(1)}  ${t.kind === "set" ? "Set saknas" : "Kort saknas i"}: ${t.set_text}${t.year ? ` (${t.year})` : ""} – ${t.users} användare, ${t.cards} kort`)
    : ["Inga öppna ärenden."];
  const text = `Saknade set och kort i Setlistan\n\n${lines.join("\n")}\n\nÖppna https://setlistan.se/admin#saknade för att hantera dem.`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [u.user.email], subject: `Saknade set och kort (${open.length} öppna)`, text }),
  });
  return r.ok ? Response.json({ sent: true }) : Response.json({ error: "send failed" }, { status: 502 });
}
