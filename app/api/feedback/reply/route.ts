import { createClient } from "@/lib/supabase/server";
import { esc, sendMail, siteUrl } from "@/lib/email";

export const runtime = "nodejs";
export const maxDuration = 15;

// A reply in a feedback thread. { feedback_id, text, as: "admin" | "user" }.
// An administrator's reply is e-mailed to the user; a user's reply is e-mailed to FEEDBACK_NOTIFY_EMAIL.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Logga in." }, { status: 401 });

  const b = (await req.json().catch(() => null)) as { feedback_id?: unknown; text?: unknown; as?: unknown } | null;
  const id = String(b?.feedback_id ?? "");
  const text = String(b?.text ?? "").trim().slice(0, 2000);
  const asAdmin = b?.as === "admin";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Okänd tråd." }, { status: 400 });
  if (!text) return Response.json({ error: "Skriv något först." }, { status: 400 });

  const notify = process.env.FEEDBACK_NOTIFY_EMAIL?.trim();
  const url = siteUrl();

  if (asAdmin) {
    const { data: role } = await supabase.rpc("admin_role");
    if (!role) return Response.json({ error: "Bara administratörer kan svara." }, { status: 403 });
    const { data: mail, error } = await supabase.rpc("admin_feedback_reply", { p_feedback: id, p_text: text });
    if (error) return Response.json({ error: "Kunde inte spara svaret." }, { status: 500 });
    let mailed = false;
    if (typeof mail === "string" && mail) {
      mailed = await sendMail(
        mail,
        "Svar på din feedback till Setlistan",
        `<p>Hej!</p><p>Du har fått ett svar på din feedback:</p>` +
          `<blockquote style="margin:0 0 12px;padding:8px 14px;border-left:3px solid #5b21b6;white-space:pre-wrap">${esc(text)}</blockquote>` +
          `<p>Du kan svara direkt i tjänsten: öppna <a href="${url}">${url}</a> och välj Meny, sedan Meddelanden. Du kan också svara på det här mejlet.</p>` +
          `<p>Hälsningar,<br>Richard</p>`,
        notify || undefined,
      );
    }
    return Response.json({ ok: true, mailed });
  }

  const { data: mail, error } = await supabase.rpc("feedback_user_reply", { p_feedback: id, p_text: text });
  if (error) return Response.json({ error: /too many/.test(error.message) ? "Du har skickat många meddelanden i dag. Försök igen i morgon." : "Kunde inte skicka svaret." }, { status: error.message.includes("too many") ? 429 : 500 });
  if (notify) {
    await sendMail(notify, "Nytt svar i en feedbacktråd på Setlistan", `<p><b>${esc((typeof mail === "string" && mail) || user.email || "okänd")}</b> svarade:</p><p style="white-space:pre-wrap">${esc(text)}</p><p><a href="${url}">Öppna Setlistan</a> och svara under Superuser, Inkorg.</p>`, (typeof mail === "string" && mail) || user.email || undefined);
  }
  return Response.json({ ok: true });
}
