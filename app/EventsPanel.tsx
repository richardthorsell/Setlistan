"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { VAPID_PUBLIC_KEY, keyToBytes } from "@/lib/vapid";

type Ev = { id: number; kind: string; title: string; body: string; created_at: string };
type Kind = { kind: string; label: string; enabled: boolean };

const when = (iso: string) => new Date(iso).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" });

// What has happened lately, and notifications on this phone. The list is always kept; the notification is an extra.
export default function EventsPanel({ supabase, role, onSeen }: { supabase: SupabaseClient; role: "admin" | "superuser"; onSeen?: () => void }) {
  const [events, setEvents] = useState<Ev[]>([]);
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const [kinds, setKinds] = useState<Kind[]>([]);
  const [on, setOn] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const standalone = typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
  const isIos = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

  const load = useCallback(async () => {
    const [e, k, s] = await Promise.all([
      supabase.from("admin_events").select("id, kind, title, body, created_at").order("created_at", { ascending: false }).limit(60),
      supabase.from("admin_notify_kinds").select("kind, label, enabled").order("label"),
      supabase.from("admin_seen").select("seen_at").maybeSingle(),
    ]);
    setEvents((e.data as Ev[]) || []);
    setKinds((k.data as Kind[]) || []);
    setSeenAt((s.data as { seen_at: string } | null)?.seen_at ?? null);
    // this device
    if (supported) {
      try {
        const reg = await navigator.serviceWorker.getRegistration("/admin");
        setOn(!!(await reg?.pushManager.getSubscription()));
      } catch {
        setOn(false);
      }
    }
  }, [supabase, supported]);
  useEffect(() => {
    load();
  }, [load]);

  const markSeen = async () => {
    await supabase.rpc("admin_mark_seen");
    onSeen?.();
    load();
  };

  const enable = async () => {
    setMsg(null);
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error("Du tillät inte notiser. Ändra det i telefonens inställningar för den här appen.");
      const reg = await navigator.serviceWorker.register("/admin/sw.js", { scope: "/admin" });
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(VAPID_PUBLIC_KEY) as BufferSource }));
      const j = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) throw new Error("Enheten gav ingen giltig prenumeration.");
      const { error } = await supabase.from("push_subscriptions").upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth });
      if (error) throw new Error("Kunde inte spara enheten.");
      setOn(true);
      setMsg("Notiser är påslagna på den här enheten. Tryck på Skicka testnotis för att kontrollera.");
    } catch (e) {
      setMsg((e as Error).message || "Det gick inte att slå på notiser.");
    }
    setBusy(false);
  };

  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/admin");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      setOn(false);
      setMsg("Notiser är avstängda på den här enheten.");
    } catch {
      setMsg("Det gick inte att stänga av notiser.");
    }
    setBusy(false);
  };

  const test = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin-notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ test: true }) });
      const j = (await r.json()) as { sent?: number; error?: string };
      setMsg(r.ok ? (j.sent ? "Testnotisen är skickad. Den kommer om en stund." : "Ingen enhet är registrerad än. Slå på notiser först.") : j.error === "not configured" ? "Servern är inte klar för notiser än (nycklar saknas)." : "Testnotisen kunde inte skickas.");
    } catch {
      setMsg("Testnotisen kunde inte skickas.");
    }
    setBusy(false);
  };

  const setKind = async (k: Kind, enabled: boolean) => {
    const { error } = await supabase.rpc("admin_set_notify_kind", { p_kind: k.kind, p_enabled: enabled });
    if (error) return setMsg("Kunde inte spara.");
    load();
  };

  const unseen = events.filter((e) => !seenAt || e.created_at > seenAt).length;

  return (
    <section className="panel tradera">
      <h3>Händelser</h3>
      <div className="note">Det som har hänt i Setlistan på sistone. Texterna innehåller inga e-postadresser; detaljerna finns under Översikt och drift.</div>

      <div className="label">Notiser på den här enheten</div>
      {!supported ? (
        <div className="note warn">{isIos && !standalone ? "På iPhone fungerar notiser bara när Admin ligger på hemskärmen. Öppna setlistan.se/admin i Safari, tryck på Dela och välj Lägg till på hemskärmen. Öppna sedan appen därifrån." : "Den här webbläsaren stöder inte notiser."}</div>
      ) : (
        <div className="row" style={{ flexWrap: "wrap" }}>
          {on ? <button className="btn small" type="button" disabled={busy} onClick={disable}>Stäng av notiser</button> : <button className="btn small primary" type="button" disabled={busy} onClick={enable}>Slå på notiser</button>}
          {on && <button className="btn small ghost" type="button" disabled={busy} onClick={test}>Skicka testnotis</button>}
          <span className="note">{on ? "Påslagna" : "Avstängda"}</span>
        </div>
      )}
      {msg && <div className="note" role="status">{msg}</div>}

      {role === "superuser" && kinds.length > 0 && (
        <>
          <div className="label">Vilka händelser ger notis</div>
          {kinds.map((k) => (
            <label key={k.kind} className="row" style={{ gap: 8 }}>
              <input type="checkbox" checked={k.enabled} onChange={(e) => setKind(k, e.target.checked)} />
              <span>{k.label}</span>
            </label>
          ))}
        </>
      )}

      <div className="label">Senaste händelser{unseen ? ` (${unseen} nya)` : ""}</div>
      {unseen > 0 && <div className="row"><button className="btn small" type="button" onClick={markSeen}>Markera allt som sett</button></div>}
      {events.length ? (
        <div className="admin-table">
          {events.map((e) => (
            <div key={e.id} className="admin-row">
              <span className="mono note">{when(e.created_at)}</span>
              <span className="grow"><b>{e.title}</b>{e.body ? ` · ${e.body}` : ""}</span>
              {(!seenAt || e.created_at > seenAt) && <span className="pill src">Ny</span>}
            </div>
          ))}
        </div>
      ) : (
        <div className="note">Inget har hänt sedan loggen startade.</div>
      )}
    </section>
  );
}
