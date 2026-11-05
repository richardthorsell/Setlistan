"use client";

import { useState } from "react";
import "./panels.css";

type Item = { id: string; title: string; price: number | null; buyNow: number | null; bids: number | null; ends: string; url: string; thumb: string };
type Result = { items: Item[]; total: number; cached: boolean; searchUrl: string };

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" });
};

// Searches Tradera for a card. Nothing runs until the user presses Sök: Tradera allows few calls per day.
export default function TraderaPanel({ initialQuery, signedIn, onClose }: { initialQuery: string; signedIn: boolean; onClose: () => void }) {
  const [q, setQ] = useState(initialQuery);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<{ m: string; url?: string } | null>(null);
  const fallback = "https://www.tradera.com/search?q=" + encodeURIComponent(q.trim());

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim().length < 3) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/tradera?q=" + encodeURIComponent(q.trim()));
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setRes(null);
        setErr({ m: j.error || `Fel ${r.status}`, url: j.searchUrl });
      } else setRes(j as Result);
    } catch {
      setErr({ m: "Det gick inte att nå Tradera just nu." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel tradera" aria-label="Tradera">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3>Tradera</h3>
        <button className="btn small ghost" type="button" onClick={onClose}>Stäng</button>
      </div>
      <form className="row" onSubmit={search}>
        <input className="grow t-input" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Sökord på Tradera" maxLength={100} />
        <button className="btn primary small" type="submit" disabled={busy || !signedIn}>{busy ? "Söker …" : "Sök"}</button>
        <a className="btn small" href={err?.url || res?.searchUrl || fallback} target="_blank" rel="noopener noreferrer">Öppna på Tradera</a>
      </form>
      {!signedIn && <div className="note">Logga in för att söka här. Du kan alltid öppna sökningen direkt på Tradera.</div>}
      {err && <div className="note warn">{err.m}</div>}
      {res && !res.items.length && <div className="note">Inga träffar. Prova ett kortare sökord, till exempel bara spelarens namn.</div>}
      {res && res.items.length > 0 && (
        <>
          <div className="t-list">
            {res.items.map((i) => (
              <a key={i.id || i.title} className="t-item" href={i.url} target="_blank" rel="noopener noreferrer">
                {i.thumb ? <img src={i.thumb} alt="" width={56} height={56} loading="lazy" /> : <span className="t-ph" />}
                <span className="t-title">{i.title || "Utan titel"}</span>
                <span className="t-meta mono">
                  {i.price !== null && <b>{Math.round(i.price)} kr</b>}
                  {i.buyNow !== null && <span>Köp nu {Math.round(i.buyNow)} kr</span>}
                  {i.bids !== null && <span>{i.bids} bud</span>}
                  {when(i.ends) && <span>Slutar {when(i.ends)}</span>}
                </span>
              </a>
            ))}
          </div>
          <div className="note">
            Visar {res.items.length} av {res.total} träffar{res.cached ? " · sparat svar, ingen ny förfrågan till Tradera" : ""}.
          </div>
        </>
      )}
    </section>
  );
}
