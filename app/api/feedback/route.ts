import { createClient } from "@/lib/supabase/server";
import { esc, sendMail } from "@/lib/email";

export const runtime = "nodejs";
export const maxDuration = 15;

// Signed-in users send feedback; RLS makes sure it is stored under their own id.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Logga in för att skicka feedback." }, { status: 401 });

  const b = (await req.json().catch(() => null)) as { kind?: unknown; text?: unknown; page?: unknown } | null;
  const text = String(b?.text ?? "").trim().slice(0, 2000);
  const kind = ["idea", "bug", "other"].includes(String(b?.kind)) ? String(b?.kind) : "idea";
  const page = String(b?.page ?? "").slice(0, 200);
  if (text.length < 3) return Response.json({ error: "Skriv minst några ord." }, { status: 400 });

  const { error } = await supabase.from("feedback").insert({ user_id: user.id, email: user.email ?? null, kind, page, text });
  if (error) return Response.json({ error: "Kunde inte spara feedbacken." }, { status: 500 });

  const to = process.env.FEEDBACK_NOTIFY_EMAIL?.trim();
  if (to) {
    const label = { idea: "Idé", bug: "Fel", other: "Annat" }[kind];
    await sendMail(to, `Feedback (${label}) från Setlistan`, `<p><b>${esc(user.email ?? "okänd")}</b> · ${esc(page)}</p><p style="white-space:pre-wrap">${esc(text)}</p>`, user.email ?? undefined);
  }
  return Response.json({ ok: true });
}
