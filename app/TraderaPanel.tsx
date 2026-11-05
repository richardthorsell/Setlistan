"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import "./panels.css";

type Item = { id: string; title: string; price: number | null; buyNow: number | null; bids: number | null; ends: string; url: string; thumb: string };
type Stats = { count: number; median: number | null; min: number | null; max: number | null };
type Result = { items: Item[]; stats: Stats; seen: number; total: number; cached: boolean; searchUrl: string };

// What the search is about: the set (and card) the user clicked, and the two queries it can run.
export type TraderaScope = { set: string; card: string | null; narrow: string; broad: string };

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric" });
};
const kr = (n: number | null) => (n === null ? "" : `${Math.round(n).toLocaleString("sv-SE")} kr`);

// Shows what a card has sold for on Tradera. Opening the panel from a card searches straight away;
// answers are cached for 24 h, so a repeat costs no call to Tradera.
export default function TraderaPanel({ scope, signedIn, onClose }: { scope: TraderaScope; signedIn: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<"set" | "all" | "own">("set");
  const [q, setQ] = useState(scope.narrow);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<{ m: string; url?: string } | null>(null);
  const started = useRef(false);
  const fallback = "https://www.tradera.com/search?q=" + encodeURIComponent(q.trim()) + "&itemStatus=Ended";

  const run = useCallback(async (query: string) => {
    if (query.trim().length < 3) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/tradera?q=" + encodeURIComponent(query.trim()));
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
  }, []);

  const pick = (m: "set" | "all") => {
    const next = m === "set" ? scope.narrow : scope.broad;
    setMode(m);
    setQ(next);
    run(next);
  };

  useEffect(() => {
    if (signedIn && !started.current) {
      started.current = true;
      run(scope.narrow);
    }
  }, [signedIn, scope.narrow, run]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="t-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="panel tradera" role="dialog" aria-modal="true" aria-label="Sålda kort på Tradera">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3>Sålt på Tradera</h3>
          <button className="btn small ghost" type="button" onClick={onClose}>Stäng</button>
        </div>
        <div className="t-context">
          <span className="label">Gäller</span>
          {scope.card && <b>{scope.card}</b>}
          <span>{scope.set}</span>
        </div>
        <div className="row">
          <div className="seg" role="group" aria-label="Avgränsning">
            <button type="button" aria-pressed={mode === "set"} disabled={busy || !signedIn} onClick={() => pick("set")}>Detta set</button>
            <button type="button" aria-pressed={mode === "all"} disabled={busy || !signedIn} onClick={() => pick("all")}>Alla set</button>
          </div>
          <span className="note grow">
            {mode === "set" && "Söker på spelaren och setets namn. Annonser nämner inte alltid setet, så prova Alla set om du får få träffar."}
            {mode === "all" && "Söker bara på spelaren och märket, så träffarna kan gälla andra set eller år."}
            {mode === "own" && "Egen sökning."}
          </span>
        </div>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            setMode("own");
            run(q);
          }}
        >
          <input
            className="grow t-input"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setMode("own");
            }}
            aria-label="Sökord på Tradera"
            maxLength={100}
          />
          <button className="btn primary small" type="submit" disabled={busy || !signedIn}>{busy ? "Söker …" : "Sök"}</button>
          <a className="btn small" href={err?.url || res?.searchUrl || fallback} target="_blank" rel="noopener noreferrer">Visa sålda på Tradera</a>
        </form>
        {!signedIn && <div className="note">Logga in för att se sålda kort här. Du kan alltid öppna sökningen direkt på Tradera.</div>}
        {busy && <div className="note">Hämtar sålda annonser …</div>}
        {err && <div className="note warn">{err.m}</div>}
        {res && res.stats.count > 0 && (
          <div className="t-stats">
            <b className="mono">{kr(res.stats.median)}</b> i mediansumma · lägst {kr(res.stats.min)} · högst {kr(res.stats.max)} · {res.stats.count} sålda
          </div>
        )}
        {res && !res.items.length && !busy && (
          <div className="note">Inga sålda auktioner hittades. Prova Alla set eller ett kortare sökord, till exempel bara spelarens namn.</div>
        )}
        {res && res.items.length > 0 && (
          <div className="t-list">
            {res.items.map((i) => (
              <a key={i.id || i.title} className="t-item" href={i.url} target="_blank" rel="noopener noreferrer">
                {i.thumb ? <img src={i.thumb} alt="" width={56} height={56} loading="lazy" /> : <span className="t-ph" />}
                <span className="t-title">{i.title || "Utan titel"}</span>
                <span className="t-meta mono">
                  {i.price !== null && <b>Såld för {kr(i.price)}</b>}
                  {i.bids !== null && <span>{i.bids} bud</span>}
                  {when(i.ends) && <span>{when(i.ends)}</span>}
                </span>
              </a>
            ))}
          </div>
        )}
        {res && (
          <div className="note">
            Av {res.seen} avslutade annonser hade {res.stats.count} bud och räknas som sålda. Annonser utan bud (osålda eller fasta priser) visas inte.
            {res.cached ? " Sparat svar från de senaste 24 timmarna." : ""}
          </div>
        )}
      </section>
    </div>
  );
}
