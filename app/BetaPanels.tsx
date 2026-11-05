"use client";

import { useState } from "react";
import "./panels.css";

// Waitlist signup for visitors who are not signed in.
export function WaitlistBox({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [bot, setBot] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; warn?: boolean } | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/waitlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, website: bot }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setMsg({ t: j.error || "Det gick inte just nu.", warn: true });
      else {
        setDone(true);
        setMsg({ t: j.already ? "Du står redan på väntelistan. Vi hör av oss." : "Tack! Du står nu på väntelistan och vi hör av oss när det finns en plats." });
      }
    } catch {
      setMsg({ t: "Det gick inte att nå tjänsten.", warn: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel auth" aria-label="Väntelista till betan">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3>Väntelista till betan</h3>
        <button className="btn small ghost" type="button" onClick={onClose}>Stäng</button>
      </div>
      <div className="note">Setlistan är i beta. Anmäl dig så får du en inbjudan när det finns plats.</div>
      {!done && (
        <form onSubmit={submit} className="auth-form">
          <label>
            <span className="label">Namn</span>
            <input required maxLength={100} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            <span className="label">E-post</span>
            <input type="email" required maxLength={200} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <input className="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" name="website" value={bot} onChange={(e) => setBot(e.target.value)} />
          <div className="row">
            <button className="btn primary" type="submit" disabled={busy}>{busy ? "Skickar …" : "Anmäl mig"}</button>
          </div>
        </form>
      )}
      {msg && <div className={`note ${msg.warn ? "warn" : ""}`}>{msg.t}</div>}
    </section>
  );
}

// Feedback form for signed-in users.
export function FeedbackBox({ onClose, say }: { onClose: () => void; say: (m: string) => void }) {
  const [kind, setKind] = useState<"idea" | "bug" | "other">("idea");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, text, page: location.pathname }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setErr(j.error || "Det gick inte att skicka.");
      else {
        say("Tack för din feedback!");
        onClose();
      }
    } catch {
      setErr("Det gick inte att nå tjänsten.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel auth" aria-label="Skicka feedback">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3>Feedback</h3>
        <button className="btn small ghost" type="button" onClick={onClose}>Stäng</button>
      </div>
      <form onSubmit={submit} className="auth-form">
        <div className="seg" role="group" aria-label="Typ">
          <button type="button" aria-pressed={kind === "idea"} onClick={() => setKind("idea")}>Idé</button>
          <button type="button" aria-pressed={kind === "bug"} onClick={() => setKind("bug")}>Något är fel</button>
          <button type="button" aria-pressed={kind === "other"} onClick={() => setKind("other")}>Annat</button>
        </div>
        <label>
          <span className="label">Vad vill du berätta?</span>
          <textarea required minLength={3} maxLength={2000} rows={5} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <div className="row">
          <button className="btn primary" type="submit" disabled={busy}>{busy ? "Skickar …" : "Skicka"}</button>
        </div>
      </form>
      {err && <div className="note warn">{err}</div>}
    </section>
  );
}
