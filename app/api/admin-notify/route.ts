import { timingSafeEqual } from "node:crypto";
import webpush from "web-push";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { VAPID_PUBLIC_KEY } from "@/lib/vapid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sends a phone notification to the admins' devices.
// Two ways in: the database calls it with a shared secret when an event is logged, and a signed-in admin can send a test to their own devices.
type Sub = { endpoint: string; p256dh: string; auth: string; user_id: string };

function sameSecret(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function POST(request: Request) {
  const pub = VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  const admin = adminClient();
  if (!pub || !priv || !admin) return Response.json({ error: "not configured" }, { status: 503 });
  webpush.setVapidDetails("https://setlistan.se", pub.trim(), priv);

  let body: { event_id?: unknown; test?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }

  let payload: { title: string; body: string; url: string; tag: string };
  let only: string | null = null; // a test goes only to the person who asked

  const secret = process.env.NOTIFY_SECRET?.trim();
  const given = request.headers.get("x-notify-secret") || "";
  if (secret && given && sameSecret(given, secret)) {
    const id = Number(body.event_id);
    if (!Number.isInteger(id)) return Response.json({ error: "bad event" }, { status: 400 });
    const { data: ev } = await admin.from("admin_events").select("id, kind, title, body").eq("id", id).maybeSingle();
    if (!ev) return Response.json({ error: "no such event" }, { status: 404 });
    const { data: kind } = await admin.from("admin_notify_kinds").select("enabled").eq("kind", ev.kind).maybeSingle();
    if (kind && kind.enabled === false) return Response.json({ sent: 0, skipped: "kind off" });
    payload = { title: String(ev.title), body: String(ev.body), url: "/admin#handelser", tag: String(ev.kind) };
  } else if (body.test === true) {
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();
    const { data: isAdmin } = await supabase.rpc("is_admin");
    if (!userData.user || !isAdmin) return Response.json({ error: "forbidden" }, { status: 403 });
    only = userData.user.id;
    payload = { title: "Testnotis", body: "Notiser fungerar på den här enheten.", url: "/admin#handelser", tag: "test" };
  } else {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: targets } = await admin.rpc("push_targets");
  const subs = ((targets as Sub[]) || []).filter((s) => !only || s.user_id === only);
  let sent = 0;
  const gone: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 24 });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) gone.push(s.endpoint);
      }
    }),
  );
  // a phone that has removed the permission is forgotten
  if (gone.length) await admin.from("push_subscriptions").delete().in("endpoint", gone);
  return Response.json({ sent, removed: gone.length });
}
