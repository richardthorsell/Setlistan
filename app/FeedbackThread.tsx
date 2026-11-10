"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

type Msg = { id: number; sender: "admin" | "user"; text: string; created_at: string };

const when = (iso: string) => new Date(iso).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" });

// Under a feedback row in the inbox: the replies so far, and a box to answer. The answer is e-mailed to the user and shown in the app.
export default function FeedbackThread({ supabase, id, email, mine, onChanged, say }: { supabase: SupabaseClient; id: string; email: string | null; mine?: boolean; onChanged: () => void; say: (m: string) => void }) {
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("feedback_messages").select("id, sender, text, created_at").eq("feedback_id", id).order("created_at");
    setMsgs((data as Msg[]) || []);
  }, [supabase, id]);
  useEffect(() => {
    load();
  }, [load]);

  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    const r = await fetch("/api/feedback/reply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feedback_id: id, text, as: "admin" }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return say(String(j.error || "Kunde inte skicka."));
    setText("");
    setOpen(false);
    say(j.mailed ? `Svaret är sparat. ${email} har fått ett mejl och läser det genom att logga in.` : "Svaret är sparat och syns i tjänsten när användaren loggar in. Mejlnotisen kunde inte skickas.");
    await load();
    onChanged();
  };

  return (
    <div style={{ padding: "4px 12px 10px 24px", display: "flex", flexDirection: "column", gap: 6 }}>
      {(msgs || []).map((m) => (
        <div key={m.id} className="note" style={{ whiteSpace: "pre-wrap", borderLeft: `3px solid ${m.sender === "admin" ? "var(--accent)" : "var(--line)"}`, paddingLeft: 8 }}>
          <b>{m.sender === "admin" ? "Du" : email || "Användaren"}</b> · {when(m.created_at)}
          <br />
          {m.text}
        </div>
      ))}
      {open ? (
        <>
          <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} rows={3} placeholder={email ? `Svar till ${email}` : "Svar"} aria-label="Svar" autoFocus />
          <div className="row">
            <button className="btn small primary" type="button" disabled={busy || !text.trim()} onClick={send}>{busy ? "Skickar …" : "Skicka svar"}</button>
            <button className="btn small ghost" type="button" onClick={() => setOpen(false)}>Avbryt</button>
          </div>
        </>
      ) : mine ? null : (
        <div>
          <button className="btn small primary" type="button" onClick={() => setOpen(true)}>{msgs && msgs.length ? "Svara igen" : "Svara"}</button>
        </div>
      )}
    </div>
  );
}
