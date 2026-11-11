"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TraderaScope } from "./TraderaPanel";
import "./panels.css";
import { localeOf, useLang, useT } from "@/lib/i18n";

type Item = { id: string; title: string; price: number | null; currency: string; bids: number; ends: string; url: string; thumb: string };
type Result = { items: Item[]; seen: number; withBids: number; total: number; searchUrl: string };

const SYMBOL: Record<string, string> = { USD: "$", GBP: "£", EUR: "€" };

// Running eBay auctions that already have bids. eBay's open API only covers live listings,
// so these are current bids and not sold prices.
export default function EbayPanel({ scope, signedIn, onClose }: { scope: TraderaScope; signedIn: boolean; onClose: () => void }) {
  const t = useT();
  const { lang } = useLang();
  const [mode, setMode] = useState<"set" | "all" | "own">("set");
  const [q, setQ] = useState(scope.narrow);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<{ m: string; url?: string } | null>(null);
  const started = useRef(false);
  // The query the shown result belongs to; the link only reuses that result's address while the box still holds the same words.
  const [resQ, setResQ] = useState(scope.narrow.trim());
  const fallback = "https://www.ebay.com/sch/i.html?_nkw=" + encodeURIComponent(q.trim()) + "&LH_Auction=1&_sop=1";

  const when = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(localeOf(lang), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };
  const money = (i: Item) => (i.price === null ? "" : `${SYMBOL[i.currency] ?? i.currency + " "}${i.price.toLocaleString(localeOf(lang), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

  const run = useCallback(async (query: string) => {
    if (query.trim().length < 3) return;
    setBusy(true);
    setErr(null);
    setResQ(query.trim());
    try {
      const r = await fetch("/api/ebay?q=" + encodeURIComponent(query.trim()));
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setRes(null);
        setErr({ m: j.error || `Fel ${r.status}`, url: j.searchUrl });
      } else setRes(j as Result);
    } catch {
      setErr({ m: t("Det gick inte att nå eBay just nu.") });
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
      <section className="panel tradera" role="dialog" aria-modal="true" aria-label={t("Auktioner med bud på eBay")}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3>{t("Auktioner på eBay")}</h3>
          <button className="btn small ghost" type="button" onClick={onClose}>{t("Stäng")}</button>
        </div>
        <div className="t-context">
          <span className="label">{t("Gäller")}</span>
          {scope.card && <b>{scope.card}</b>}
          <span>{scope.set}</span>
        </div>
        <div className="row">
          <div className="seg" role="group" aria-label={t("Avgränsning")}>
            <button type="button" aria-pressed={mode === "set"} disabled={busy || !signedIn} onClick={() => pick("set")}>{t("Detta set")}</button>
            <button type="button" aria-pressed={mode === "all"} disabled={busy || !signedIn} onClick={() => pick("all")}>{t("Alla set")}</button>
          </div>
          <span className="note grow">{t("Pågående auktioner som redan har bud, de som slutar först överst. Det är aktuella bud, inte slutpriser.")}</span>
        </div>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            setMode("own");
            run(q);
          }}
        >
          <input className="grow t-input" value={q} onChange={(e) => { setQ(e.target.value); setMode("own"); }} aria-label={t("Sökord på eBay")} maxLength={100} />
          <button className="btn primary small" type="submit" disabled={busy || !signedIn}>{busy ? t("Söker …") : t("Sök")}</button>
          <a className="btn small" href={(resQ === q.trim() && (err?.url || res?.searchUrl)) || fallback} target="_blank" rel="noopener noreferrer">{t("Öppna på eBay")}</a>
        </form>
        {!signedIn && <div className="note">{t("Logga in för att se auktioner här. Du kan alltid öppna sökningen direkt på eBay.")}</div>}
        {busy && <div className="note">{t("Hämtar auktioner …")}</div>}
        {err && <div className="note warn">{err.m}</div>}
        {res && !res.items.length && !busy && <div className="note">{t("Inga pågående auktioner med bud hittades. Prova Alla set eller ett kortare sökord.")}</div>}
        {res && res.items.length > 0 && (
          <div className="t-list">
            {res.items.map((i) => (
              <a key={i.id || i.title} className="t-item" href={i.url} target="_blank" rel="noopener noreferrer">
                {i.thumb ? <img src={i.thumb} alt="" width={56} height={56} loading="lazy" /> : <span className="t-ph" />}
                <span className="t-title">{i.title || t("Utan titel")}</span>
                <span className="t-meta mono">
                  {i.price !== null && <b>{money(i)}</b>}
                  <span>{i.bids} {t("bud")}</span>
                  {when(i.ends) && <span>{t("slutar")} {when(i.ends)}</span>}
                </span>
              </a>
            ))}
          </div>
        )}
        {res && (
          <div className="note">{res.withBids} {t("av")} {res.seen} {t("hämtade auktioner har bud.")}</div>
        )}
      </section>
    </div>
  );
}
