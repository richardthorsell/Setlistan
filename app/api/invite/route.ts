import { createClient } from "@/lib/supabase/server";
import { emailEnabled, esc, sendMail, siteUrl } from "@/lib/email";

export const runtime = "nodejs";
export const maxDuration = 15;

// Admin only: e-mail an invitation to someone on the waitlist and mark them as invited.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Logga in." }, { status: 401 });
  const { data: role } = await supabase.rpc("admin_role");
  if (!role) return Response.json({ error: "Bara administratörer kan bjuda in." }, { status: 403 });
  if (!emailEnabled()) return Response.json({ error: "Resend är inte kopplat än (RESEND_API_KEY saknas i Vercel)." }, { status: 503 });

  const b = (await req.json().catch(() => null)) as { id?: unknown } | null;
  const id = String(b?.id ?? "");
  const { data: row } = await supabase.from("waitlist").select("id, name, email").eq("id", id).maybeSingle();
  if (!row) return Response.json({ error: "Hittade inte personen." }, { status: 404 });

  const ok = await sendMail(
    row.email,
    "Du är inbjuden till betan av Setlistan",
    `<p>Hej ${esc(row.name)}!</p><p>Nu finns det en plats åt dig i betan av Setlistan. Skapa ett konto med den här e-postadressen:</p><p><a href="${siteUrl()}">${siteUrl()}</a></p><p>Hör gärna av dig med feedback via knappen i appen.</p>`,
  );
  if (!ok) return Response.json({ error: "Mejlet kunde inte skickas. Kontrollera Resend-nyckeln och avsändardomänen." }, { status: 502 });
  await supabase.from("waitlist").update({ invited_at: new Date().toISOString() }).eq("id", row.id);
  return Response.json({ ok: true });
}
