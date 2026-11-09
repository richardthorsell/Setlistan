import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { esc, sendMail, siteUrl } from "@/lib/email";
import { validName } from "@/lib/waitlist";

export const runtime = "nodejs";
export const maxDuration = 15;

// Public: join the beta waitlist. The database function validates and deduplicates.
export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as { name?: unknown; email?: unknown; website?: unknown; consent?: unknown } | null;
  // Hidden field that only bots fill in.
  if (b?.website) return Response.json({ ok: true });
  // Joining the waitlist needs consent to storing the name and e-mail (see the privacy policy).
  if (b?.consent !== true) return Response.json({ error: "Du behöver godkänna att vi sparar dina uppgifter." }, { status: 400 });
  const name = String(b?.name ?? "").trim().slice(0, 100);
  const email = String(b?.email ?? "").trim().toLowerCase().slice(0, 200);
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return Response.json({ error: "Fyll i namn och en giltig e-postadress." }, { status: 400 });
  if (!validName(name)) return Response.json({ error: "Skriv ditt namn med bokstäver, utan länkar eller siffror." }, { status: 400 });

  // At most five attempts per visitor and hour. Only a daily-changing hash of the IP address is stored, never the address.
  // Written with the service role; if the key or the migration is missing the form still works, just without this limit.
  const admin = adminClient();
  if (admin) {
    const ip = (req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown").trim();
    const hash = createHash("sha256").update(`${ip}|${new Date().toISOString().slice(0, 10)}|${process.env.WAITLIST_IP_SALT ?? ""}`).digest("hex");
    const { data: allowed, error: rateErr } = await admin.rpc("waitlist_rate_ok", { p_ip_hash: hash });
    if (rateErr) console.error("waitlist: rate limit check failed", rateErr.message);
    else if (allowed === false) return Response.json({ error: "För många försök. Försök igen om en stund." }, { status: 429 });
  } else {
    console.warn("waitlist: SUPABASE_SERVICE_ROLE_KEY is not set, so there is no rate limit");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("waitlist_join", { p_name: name, p_email: email, p_source: "web" });
  if (error) return Response.json({ error: "Det gick inte just nu. Försök igen om en stund." }, { status: 500 });
  if (data === "ok") {
    await sendMail(
      email,
      "Du står på väntelistan till Setlistan",
      `<p>Hej ${esc(name)}!</p><p>Tack för att du anmält dig till betan av Setlistan. Vi hör av oss när det finns en plats åt dig.</p><p><a href="${siteUrl()}">${siteUrl()}</a></p>`,
    );
  }
  return Response.json({ ok: true, already: data === "exists" });
}
