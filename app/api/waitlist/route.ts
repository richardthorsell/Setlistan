import { createClient } from "@/lib/supabase/server";
import { esc, sendMail, siteUrl } from "@/lib/email";

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
