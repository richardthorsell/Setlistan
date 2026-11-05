"use client";

import { useState } from "react";
import "./panels.css";
import "./legal.css";
import { useT } from "@/lib/i18n";

// Waitlist signup for visitors who are not signed in.
export function WaitlistBox({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [bot, setBot] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; warn?: boolean } | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/waitlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, website: bot, consent }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setMsg({ t: j.error || t("Det gick inte just nu."), warn: true });
      else {
        setDone(true);
        setMsg({ t: j.already ? t("Du står redan på väntelistan. Vi hör av oss.") : t("Tack! Du står nu på väntelistan och vi hör av oss när det finns en plats.") });
      }
    } catch {
      setMsg({ t: t("Det gick inte att nå tjänsten."), warn: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel auth" aria-label={t("Väntelista till betan")}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3>{t("Väntelista till betan")}</h3>
        <button className="btn small ghost" type="button" onClick={onClose}>{t("Stäng")}</button>
      </div>
      <div className="note">{t("Setlistan är i beta. Anmäl dig så får du en inbjudan när det finns plats.")}</div>
      {!done && (
        <form onSubmit={submit} className="auth-form">
          <label>
            <span className="label">{t("Namn")}</span>
            <input required maxLength={100} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            <span className="label">{t("E-post")}</span>
            <input type="email" required maxLength={200} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <input className="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" name="website" value={bot} onChange={(e) => setBot(e.target.value)} />
          <label className="consent">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
            <span>{t("Jag samtycker till att Setlistan sparar mitt namn och min e-post för att kunna bjuda in mig, enligt")}{" "}<a href="/integritet" target="_blank" rel="noopener noreferrer">{t("integritetspolicyn")}</a>{t(". Jag kan när som helst be om att bli borttagen.")}</span>
          </label>
          <div className="row">
            <button className="btn primary" type="submit" disabled={busy || !consent}>{busy ? t("Skickar …") : t("Anmäl mig")}</button>
          </div>
        </form>
      )}
      {msg && <div className={`note ${msg.warn ? "warn" : ""}`}>{msg.t}</div>}
    </section>
  );
}

// Feedback form for signed-in users.
export function FeedbackBox({ onClose, say }: { onClose: () => void; say: (m: string) => void }) {
  const t = useT();
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
      if (!r.ok) setErr(j.error || t("Det gick inte att skicka."));
      else {
        say(t("Tack för din feedback!"));
        onClose();
      }
    } catch {
      setErr(t("Det gick inte att nå tjänsten."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel auth" aria-label={t("Skicka feedback")}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3>{t("Feedback")}</h3>
        <button className="btn small ghost" type="button" onClick={onClose}>{t("Stäng")}</button>
      </div>
      <form onSubmit={submit} className="auth-form">
        <div className="seg" role="group" aria-label={t("Typ")}>
          <button type="button" aria-pressed={kind === "idea"} onClick={() => setKind("idea")}>{t("Idé")}</button>
          <button type="button" aria-pressed={kind === "bug"} onClick={() => setKind("bug")}>{t("Något är fel")}</button>
          <button type="button" aria-pressed={kind === "other"} onClick={() => setKind("other")}>{t("Annat")}</button>
        </div>
        <label>
          <span className="label">{t("Vad vill du berätta?")}</span>
          <textarea required minLength={3} maxLength={2000} rows={5} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <div className="row">
          <button className="btn primary" type="submit" disabled={busy}>{busy ? t("Skickar …") : t("Skicka")}</button>
        </div>
      </form>
      {err && <div className="note warn">{err}</div>}
    </section>
  );
}
