"use client";

import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import "./panels.css";
import { useT } from "@/lib/i18n";
import { ADVISOR_SUGGESTIONS, INTENT_LABEL, SUGGESTIONS, detectIntent, type Intent } from "@/lib/assistant";
import { sportLabel } from "@/lib/checklist";

type SetRow = { set_key: string; set_title: string };
type CardRow = SetRow & { card_id: number; section_code: string; card_no: number; card_name: string; team: string };
type Nearly = SetRow & { set_sport: string; have_cards: number; total_cards: number; missing_cards: number; pct: number };
type Missing = CardRow & { total_missing: number };
type Dup = CardRow & { variant: string | null; qty: number; extra: number; for_sale: number; sell_price: number | null };
type Sale = CardRow & { for_sale: number; sell_price: number | null };
type Player = { player_name: string | null; owned_cards: number; owned_sets: number; library_cards: number; library_sets: number };
type NotStarted = SetRow & { set_sport: string; total_cards: number };
type Summary = {
  sets_started: number; sets_complete: number; cards_owned: number; copies: number; duplicate_cards: number; parallels_owned: number;
  for_sale: number; incoming: number; wishlist: number; by_sport: { sport: string; sets: number; cards: number }[]; by_month: { month: string; added: number }[];
};
type SellSug = Dup & { ref_median: number | null; ref_sold: number | null; ref_min: number | null; ref_max: number | null; ref_age_days: number | null; est_value: number | null };
type Plan = {
  targets: { set_key: string; set_title: string; pct: number; missing: number; priced: number; unpriced: number; est_cost: number }[];
  est_cost: number; cost_unpriced: number;
  sell: { card_id: number; set_key: string; set_title: string; card_no: number; card_name: string; extra: number; ref_median: number | null; ref_sold: number | null; est_value: number | null }[];
  est_income: number; income_unpriced: number;
};
type Answer = { intent: Intent; cached: boolean; rows: unknown };

const kr = (n: number) => `${Math.round(n).toLocaleString("sv-SE")} kr`;

const label = (c: { section_code: string; card_no: number }) => (c.section_code ? `${c.section_code} ${c.card_no}` : String(c.card_no));

// Collector Assistant, version 1: ready-made questions and a few typed ones, all answered by fixed database functions.
// No AI is involved: a typed question is matched against known intents, and anything else gets a hint instead of a guess.
export default function CollectorAssistant({ supabase, onClose, onOpenSet, advisor = false, ai = false }: { supabase: SupabaseClient; onClose: () => void; onOpenSet: (id: string) => void; advisor?: boolean; ai?: boolean }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // Answers are reused until the user's collection data changes (the database returns a fingerprint of it).
  const cache = useRef(new Map<string, unknown>());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const call = async (i: Intent) => {
    switch (i.name) {
      case "nearly_complete":
        return supabase.rpc("assistant_nearly_complete", { p_min: i.min, p_sport: i.sport ?? null, p_limit: i.limit });
      case "missing_cards":
        return supabase.rpc("assistant_missing_cards", { p_set: null, p_player: i.player ?? null, p_sport: i.sport ?? null, p_limit: i.limit });
      case "top_duplicates":
        return supabase.rpc("assistant_top_duplicates", { p_limit: i.limit, p_sellable: false });
      case "sell_candidates":
        return supabase.rpc("assistant_top_duplicates", { p_limit: i.limit, p_sellable: true });
      case "for_sale_marked":
        return supabase.rpc("assistant_for_sale", { p_limit: i.limit });
      case "player_collection":
        return supabase.rpc("assistant_player_collection", { p_player: i.player });
      case "not_started":
        return supabase.rpc("assistant_not_started", { p_limit: i.limit });
      case "collection_summary":
        return supabase.rpc("assistant_collection_summary");
      case "sell_suggestions":
        return supabase.rpc("advisor_sell_suggestions", { p_limit: i.limit });
      case "completion_plan":
        return supabase.rpc("advisor_completion_plan", { p_sell_sport: i.sellSport ?? null, p_target_sport: i.targetSport ?? null, p_targets: i.targets });
    }
  };

  const run = async (i: Intent, source: "suggestion" | "rule" | "ai") => {
    setBusy(true);
    setMsg(null);
    const t0 = performance.now();
    const ver = await supabase.rpc("assistant_data_version");
    const key = `${ver.data ?? "?"}|${JSON.stringify(i)}`;
    let rows = cache.current.get(key);
    const cached = rows !== undefined;
    if (!cached) {
      const { data, error } = await call(i);
      if (error) {
        setBusy(false);
        setAnswer(null);
        return setMsg(/too short/.test(error.message) ? t("Skriv minst tre tecken i spelarnamnet.") : t("Kunde inte hämta svaret just nu."));
      }
      rows = data;
      if (ver.data) cache.current.set(key, rows);
    }
    setBusy(false);
    setAnswer({ intent: i, cached, rows });
    // What was asked and how it was answered; no question text and no card data.
    void supabase.from("assistant_events").insert({ intent: i.name, source, cached, ms: Math.round(performance.now() - t0) });
  };

  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    const i = detectIntent(q, { advisor });
    if (i) return run(i, "rule");
    const hint = t("Jag förstod inte frågan. Välj ett av förslagen ovan eller fråga till exempel “Vilka set är nästan klara?”, “Hur många Messikort har jag?” eller “Vilka dubbletter har jag?”.");
    setAnswer(null);
    if (!ai) {
      void supabase.from("assistant_events").insert({ intent: "unknown", source: "none", cached: false });
      return setMsg(hint);
    }
    // No rule matched: a small model may pick one of the allowed intents (it never sees the collection and never writes SQL).
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q }) });
      const j = (await res.json().catch(() => null)) as { intent?: Intent | null; error?: string } | null;
      setBusy(false);
      if (!res.ok) return setMsg(j?.error || t("AI-tolkningen misslyckades just nu. Välj ett av förslagen."));
      if (!j?.intent) return setMsg(hint);
      await run(j.intent, "ai");
    } catch {
      setBusy(false);
      setMsg(t("AI-tolkningen misslyckades just nu. Välj ett av förslagen."));
    }
  };

  const suggestions = [...SUGGESTIONS.filter((s) => !(advisor && s.intent.name === "sell_candidates")), ...(advisor ? ADVISOR_SUGGESTIONS : [])];
  const refNote = (c: { ref_median: number | null; ref_sold: number | null; ref_age_days: number | null }) =>
    c.ref_median == null
      ? t("prisuppgift saknas")
      : `~${kr(c.ref_median)} (${c.ref_sold} ${t("sålda")}${c.ref_sold != null && c.ref_sold < 3 ? `, ${t("få försäljningar")}` : ""}${c.ref_age_days != null && c.ref_age_days > 60 ? `, ${t("gammal uppgift")}` : ""})`;

  const SetLink = ({ id, title }: { id: string; title: string }) => (
    <button className="btn small ghost" type="button" onClick={() => onOpenSet(id)} aria-label={`${t("Öppna setet")} ${title}`}>{title}</button>
  );

  const cardRows = <T extends CardRow & { variant?: string | null }>(rows: T[], extra?: (c: T) => string) =>
    rows.map((c, n) => (
      <div key={`${c.card_id}-${c.variant ?? ""}-${n}`} className="par-row">
        <span className="mono note">{label(c)}</span>
        <span className="grow"><b>{c.card_name}</b>{c.team ? <span className="note"> · {c.team}</span> : null}{c.variant ? <span className="note"> · {c.variant}</span> : null}</span>
        {extra && <span className="note mono">{extra(c)}</span>}
        <SetLink id={c.set_key} title={c.set_title} />
      </div>
    ));

  const body = () => {
    if (!answer) return null;
    const { intent, rows } = answer;
    switch (intent.name) {
      case "nearly_complete": {
        const r = rows as Nearly[];
        if (!r.length) return <div className="note">{t("Inga set är över")} {intent.min} % {t("klara än.")}</div>;
        return r.map((s) => (
          <div key={s.set_key} className="wish-box">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <SetLink id={s.set_key} title={s.set_title} />
              <b className="mono">{s.pct} %</b>
            </div>
            <span className="bar"><i style={{ width: `${s.pct}%` }} /></span>
            <div className="note">{s.have_cards} / {s.total_cards} {t("kort")} · {t("saknar")} {s.missing_cards}</div>
          </div>
        ));
      }
      case "missing_cards": {
        const r = rows as Missing[];
        if (!r.length) return <div className="note">{t("Inga saknade kort hittades i de set du har börjat på.")}</div>;
        return (
          <>
            <div className="note">{t("Visar")} {r.length} {t("av")} {r[0].total_missing.toLocaleString("sv-SE")} {t("saknade kort i set du har börjat på.")}</div>
            {cardRows(r)}
          </>
        );
      }
      case "top_duplicates":
      case "sell_candidates": {
        const r = rows as Dup[];
        if (!r.length) return <div className="note">{t("Du har inga dubbletter.")}</div>;
        return (
          <>
            {intent.name === "sell_candidates" && <div className="note">{t("Dubbletter utan dina favoritkort. Kort du markerat till försäljning kommer först. Prisuppgifter ingår inte i den här versionen.")}</div>}
            {cardRows(r, (c) => `${c.extra} ${t("extra")}${c.for_sale ? ` · ${t("till salu")}${c.sell_price ? ` ${c.sell_price} kr` : ""}` : ""}`)}
          </>
        );
      }
      case "sell_suggestions": {
        const r = rows as SellSug[];
        if (!r.length) return <div className="note">{t("Du har inga dubbletter att sälja just nu.")}</div>;
        return (
          <>
            <div className="note">{t("Dubbletter utan dina favorit- och önskelistekort. Prisreferensen är medianen av sålda Tradera-auktioner i en sparad sökning för just det här kortet. Det är en fingervisning och ingen värdering av variant och skick. Paralleller får inget pris.")}</div>
            {cardRows(r, (c) => `${c.extra} ${t("extra")} · ${refNote(c)}${c.est_value != null ? ` · ≈ ${kr(c.est_value)}` : ""}`)}
          </>
        );
      }
      case "completion_plan": {
        const p = rows as Plan;
        if (!p.targets.length) return <div className="note">{t("Hittade inga nästan klara set att komplettera (minst 50 % klara).")}</div>;
        return (
          <>
            <div className="note">{t("Räknar bara med priser som finns. Kort utan prisuppgift tas inte med i summorna.")}</div>
            <div className="label">{t("Set att komplettera")}</div>
            {p.targets.map((s) => (
              <div key={s.set_key} className="wish-box">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <SetLink id={s.set_key} title={s.set_title} />
                  <b className="mono">{s.pct} %</b>
                </div>
                <div className="note">{t("saknar")} {s.missing} {t("kort")} · {s.priced > 0 ? `${t("kända priser")} ≈ ${kr(s.est_cost)} (${s.priced} ${t("kort")})` : t("prisuppgift saknas")}{s.unpriced > 0 && s.priced > 0 ? ` · ${s.unpriced} ${t("utan pris")}` : ""}</div>
              </div>
            ))}
            <div className="label">{t("Säljförslag som kan finansiera det")}</div>
            {p.sell.length === 0 ? <div className="note">{t("Du har inga dubbletter att sälja.")}</div> : p.sell.map((c) => (
              <div key={c.card_id} className="par-row">
                <span className="mono note">{c.card_no}</span>
                <span className="grow"><b>{c.card_name}</b></span>
                <span className="note mono">{c.extra} {t("extra")}{c.ref_median != null ? ` · ~${kr(c.ref_median)}` : ` · ${t("prisuppgift saknas")}`}</span>
                <SetLink id={c.set_key} title={c.set_title} />
              </div>
            ))}
            <div className="wish-box">
              <div><b>{t("Beräknad intäkt")}:</b> {p.est_income > 0 ? `≈ ${kr(p.est_income)}` : "–"}{p.income_unpriced > 0 ? ` · ${p.income_unpriced} ${t("kort utan pris")}` : ""}</div>
              <div><b>{t("Beräknad kostnad")}:</b> {p.est_cost > 0 ? `≈ ${kr(p.est_cost)}` : "–"}{p.cost_unpriced > 0 ? ` · ${p.cost_unpriced} ${t("kort utan pris")}` : ""}</div>
              {p.cost_unpriced > 0 && <div className="note">{t("Kostnaden är ofullständig: många kort saknar prisuppgift, så den verkliga kostnaden är högre.")}</div>}
            </div>
          </>
        );
      }
      case "for_sale_marked": {
        const r = rows as Sale[];
        if (!r.length) return <div className="note">{t("Du har inte markerat några kort till försäljning.")}</div>;
        return cardRows(r, (c) => `${c.for_sale} ${t("st")}${c.sell_price ? ` · ${c.sell_price} kr` : ""}`);
      }
      case "player_collection": {
        const r = (rows as Player[])[0];
        if (!r || !r.library_cards) return <div className="note">{t("Inga kort hittades för")} “{intent.player}”.</div>;
        return (
          <div className="ov-grid">
            <div className="ov-tile"><span className="label">{r.player_name || intent.player}</span><span className="ov-num">{r.owned_cards}</span><span className="ov-sub">{t("kort du har")}</span></div>
            <div className="ov-tile"><span className="label">{t("Finns i biblioteket")}</span><span className="ov-num">{r.library_cards.toLocaleString("sv-SE")}</span><span className="ov-sub">{t("kort")} · {r.library_sets} {t("set")}</span></div>
            <div className="ov-tile"><span className="label">{t("Dina set med spelaren")}</span><span className="ov-num">{r.owned_sets}</span></div>
          </div>
        );
      }
      case "not_started": {
        const r = rows as NotStarted[];
        if (!r.length) return <div className="note">{t("Alla dina favoritset är påbörjade.")}</div>;
        return r.map((s) => (
          <div key={s.set_key} className="par-row"><span className="grow"><SetLink id={s.set_key} title={s.set_title} /></span><span className="note mono">{s.total_cards.toLocaleString("sv-SE")} {t("kort")}</span></div>
        ));
      }
      case "collection_summary": {
        const s = rows as Summary;
        const tile = (n: number, l: string) => (
          <div className="ov-tile" key={l}><span className="ov-num">{n.toLocaleString("sv-SE")}</span><span className="ov-sub">{l}</span></div>
        );
        const max = Math.max(1, ...s.by_month.map((m) => m.added));
        return (
          <>
            <div className="ov-grid">
              {tile(s.cards_owned, t("kort"))}
              {tile(s.sets_started, t("påbörjade set"))}
              {tile(s.sets_complete, t("kompletta set"))}
              {tile(s.duplicate_cards, t("dubbletter"))}
              {tile(s.parallels_owned, t("paralleller"))}
              {tile(s.for_sale, t("till salu"))}
              {tile(s.wishlist, t("på önskelistan"))}
            </div>
            {s.by_sport.length > 0 && (
              <>
                <div className="label">{t("Per sport")}</div>
                {s.by_sport.map((p) => (
                  <div key={p.sport} className="par-row"><span className="grow">{t(sportLabel(p.sport))}</span><span className="note mono">{p.cards.toLocaleString("sv-SE")} {t("kort")} · {p.sets} {t("set")}</span></div>
                ))}
              </>
            )}
            {s.by_month.length > 0 && (
              <>
                <div className="label">{t("Tillagda kort per månad")}</div>
                {s.by_month.map((m) => (
                  <div key={m.month} className="par-row">
                    <span className="mono note" style={{ width: 70 }}>{m.month}</span>
                    <span className="bar grow"><i style={{ width: `${Math.round((m.added / max) * 100)}%` }} /></span>
                    <span className="mono note" style={{ width: 40, textAlign: "right" }}>{m.added}</span>
                  </div>
                ))}
              </>
            )}
          </>
        );
      }
    }
  };

  return (
    <div className="t-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="panel tradera" role="dialog" aria-modal="true" aria-label={t("Collector Assistant")}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3>{t("Collector Assistant")}</h3>
          <button className="btn small ghost" type="button" onClick={onClose}>{t("Stäng")}</button>
        </div>
        <div className="note">{ai ? t("Frågor om din egen samling. Svaren räknas fram ur din lista och ändrar ingenting. Förstår jag inte en fråga får en liten AI-modell välja rätt typ av fråga, men den ser aldrig din samling.") : t("Frågor om din egen samling. Svaren räknas fram direkt ur din lista, utan AI, och ändrar ingenting.")}</div>

        <div className="row" style={{ flexWrap: "wrap" }}>
          {suggestions.map((s) => (
            <button key={s.label} className="btn small" type="button" disabled={busy} onClick={() => { setQ(""); run(s.intent, "suggestion"); }}>{t(s.label)}</button>
          ))}
        </div>
        <form className="row" onSubmit={ask}>
          <input className="t-input grow" maxLength={200} placeholder={t("Eller ställ en fråga, till exempel: hur många Messikort har jag?")} aria-label={t("Din fråga")} value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn primary" type="submit" disabled={busy || q.trim().length < 3}>{t("Fråga")}</button>
        </form>

        {msg && <div className="note" role="status">{msg}</div>}
        {busy && <div className="note">{t("Räknar …")}</div>}
        {answer && !busy && (
          <>
            <div className="label">{t(INTENT_LABEL[answer.intent.name])}{answer.cached ? ` · ${t("från minnet")}` : ""}</div>
            {body()}
          </>
        )}
      </section>
    </div>
  );
}
