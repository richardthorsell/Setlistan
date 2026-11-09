import { createClient } from "@/lib/supabase/server";
import { emailEnabled, sendMail, siteUrl } from "@/lib/email";

export const runtime = "nodejs";
export const maxDuration = 15;

const COOLDOWN_DAYS = 7;

type Row = { email: string; last_sign_in_at: string | null; cards: number | string; nudged_at: string | null };

// Admin only: e-mail a friendly nudge to someone who has signed in but not ticked off any cards yet.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Logga in." }, { status: 401 });
  const { data: role } = await supabase.rpc("admin_role");
  if (!role) return Response.json({ error: "Bara administratörer kan nudga." }, { status: 403 });
  if (!emailEnabled()) return Response.json({ error: "Resend är inte kopplat än (RESEND_API_KEY saknas i Vercel)." }, { status: 503 });

  const b = (await req.json().catch(() => null)) as { email?: unknown } | null;
  const email = String(b?.email ?? "").trim().toLowerCase();
  const { data: accounts } = await supabase.rpc("admin_accounts");
  const a = ((accounts as Row[] | null) || []).find((x) => x.email === email);
  if (!a) return Response.json({ error: "Hittade inte kontot." }, { status: 404 });
  if (!a.last_sign_in_at) return Response.json({ error: "Kontot har aldrig loggat in." }, { status: 400 });
  if (Number(a.cards) > 0) return Response.json({ error: "Kontot har redan börjat samla." }, { status: 400 });
  if (a.nudged_at && Date.now() - new Date(a.nudged_at).getTime() < COOLDOWN_DAYS * 86400000) {
    return Response.json({ error: `Kontot nudgades för mindre än ${COOLDOWN_DAYS} dagar sedan.` }, { status: 429 });
  }

  const url = siteUrl();
  const ok = await sendMail(
    email,
    "Kom igång med din samling på Setlistan",
    `<p>Hej!</p><p>Du har loggat in på Setlistan men inte hunnit pricka av några kort än. Det tar bara en minut att komma igång:</p>` +
      `<ol><li>Sök på en spelare eller ett set.</li><li>Tryck på de kort du har.</li><li>Se direkt vilka som saknas.</li></ol>` +
      `<p><a href="${url}">${url}</a></p>` +
      `<p>Saknar du ett set eller är något oklart? Skriv till oss med Feedback-knappen i appen så fixar vi det.</p>` +
      `<p>Hälsningar,<br>Richard</p>`,
  );
  if (!ok) return Response.json({ error: "Mejlet kunde inte skickas. Kontrollera Resend-nyckeln och avsändardomänen." }, { status: 502 });
  await supabase.rpc("admin_mark_nudged", { p_email: email });
  return Response.json({ ok: true });
}
