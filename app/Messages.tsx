"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import "./panels.css";
import { useLang, localeOf, useT } from "@/lib/i18n";

type Fb = { id: string; kind: string; text: string; created_at: string };
type Msg = { id: number; feedback_id: string; sender: "admin" | "user"; text: string; created_at: string };

// The user's side of the feedback: what they wrote, the answers from Richard, and a box to answer back.
export default function Messages({ supabase, userId, onClose, onRead, say }: { supabase: SupabaseClient; userId: string; onClose: () => void; onRead: () => void; say: (m: string) => void }) {
  const t = useT();
  const { lang } = useLang();
  const [fbs, setFbs] = useState<Fb[] | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const when = (iso: string) => new Date(iso).toLocaleString(localeOf(lang), { dateStyle: "short", timeStyle: "short" });

  const load = useCallback(async () => {
    const [f, m] = await Promise.all([supabase.from("feedback").select("id, kind, text, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(50), supabase.from("feedback_messages").select("id, feedback_id, sender, text, created_at").order("created_at")]);
    setFbs((f.data as Fb[]) || []);
    setMsgs((m.data as Msg[]) || []);
  }, [supabase]);
  useEffect(() => {
    load().then(() => supabase.rpc("mark_messages_read").then(() => onRead()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const send = async (id: string) => {
    const text = (drafts[id] || "").trim();
    if (!text || busy) return;
    setBusy(id);
    const r = await fetch("/api/feedback/reply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feedback_id: id, text, as: "user" }) });
    const j = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) return say(String(j.error || t("Kunde inte skicka svaret.")));
    setDrafts((d) => ({ ...d, [id]: "" }));
    say(t("Tack! Ditt svar är skickat."));
    load();
  };

  const threads = (fbs || []).filter((f) => msgs.some((m) => m.feedback_id === f.id));
  const others = (fbs || []).filter((f) => !threads.includes(f));

  const thread = (f: Fb) => (
    <div key={f.id} className="wish-box">
      <div className="note" style={{ whiteSpace: "pre-wrap" }}><b>{t("Du")}</b> · {when(f.created_at)}<br />{f.text}</div>
      {msgs.filter((m) => m.feedback_id === f.id).map((m) => (
        <div key={m.id} className="note" style={{ whiteSpace: "pre-wrap", borderLeft: `3px solid ${m.sender === "admin" ? "var(--accent)" : "var(--line)"}`, paddingLeft: 8 }}>
          <b>{m.sender === "admin" ? "Richard" : t("Du")}</b> · {when(m.created_at)}<br />{m.text}
        </div>
      ))}
      {msgs.some((m) => m.feedback_id === f.id) && (
        <div className="row">
          <input className="t-input grow" maxLength={2000} value={drafts[f.id] || ""} onChange={(e) => setDrafts((d) => ({ ...d, [f.id]: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && send(f.id)} placeholder={t("Svara Richard")} aria-label={t("Svara Richard")} />
          <button className="btn small primary" type="button" disabled={busy === f.id || !(drafts[f.id] || "").trim()} onClick={() => send(f.id)}>{t("Skicka")}</button>
        </div>
      )}
    </div>
  );

  return (
    <div className="t-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="panel tradera" role="dialog" aria-modal="true" aria-label={t("Meddelanden")}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3>{t("Meddelanden")}</h3>
          <button className="btn small ghost" type="button" onClick={onClose}>{t("Stäng")}</button>
        </div>
        {!fbs && <div className="note">{t("Läser …")}</div>}
        {fbs && !fbs.length && <div className="note">{t("Du har inte skickat någon feedback än. Använd Meny, sedan Feedback.")}</div>}
        {fbs && fbs.length > 0 && !threads.length && <div className="note">{t("Inga svar än. När Richard svarar på din feedback syns det här, och du får ett mejl.")}</div>}
        {threads.map(thread)}
        {others.length > 0 && threads.length > 0 && <div className="label">{t("Utan svar än")}</div>}
        {others.map((f) => (
          <div key={f.id} className="note" style={{ whiteSpace: "pre-wrap" }}>{when(f.created_at)}<br />{f.text}</div>
        ))}
      </section>
    </div>
  );
}
