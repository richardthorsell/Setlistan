"use client";

import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import "./panels.css";
import { useT } from "@/lib/i18n";
import PlayerCardPar from "./PlayerCardPar";
import TraderaPanel, { type TraderaScope } from "./TraderaPanel";

type Hit = { player_key: string; display_name: string; cards: number; sets: number; variants?: number };
type Fav = { player_key: string; display_name: string };
type PCard = { card_id: number; set_id: string; set_name: string; sport: string | null; section_code: string; section_name: string; no: number; name: string; team: string | null; qty: number | null };

// Search a player across all sets, follow him, and see every card of his with have/missing.
export default function PlayerPanel({ supabase, initialQ = "", initialSel = null, onClose, onOpenSet }: { supabase: SupabaseClient; initialQ?: string; initialSel?: Fav | null; onClose: () => void; onOpenSet: (id: string) => void }) {
  const t = useT();
  const [q, setQ] = useState(initialQ);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [favs, setFavs] = useState<Fav[]>([]);
  const [sel, setSel] = useState<Fav | null>(initialSel);
  const [cards, setCards] = useState<PCard[] | null>(null);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [parCard, setParCard] = useState<PCard | null>(null);
  const [parCounts, setParCounts] = useState<Map<number, number>>(new Map());
  const [favCards, setFavCards] = useState<Set<number>>(new Set());
  const [wishIds, setWishIds] = useState<Set<number>>(new Set());
  const [tradera, setTradera] = useState<TraderaScope | null>(null);

  // Followed players, loaded once (t changes on every render so it must not be a dependency).
  useEffect(() => {
    supabase
      .from("favorite_players")
      .select("player_key, display_name")
      .order("created_at", { ascending: false })
      .then(({ data }) => setFavs((data as Fav[]) || []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || parCard) return;
      if (sel) setSel(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, sel, parCard]);

  // Debounced search.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 3) {
      setHits(null);
      setSearching(false);
      return;
    }
    let live = true;
    setSearching(true);
    const h = setTimeout(async () => {
      const { data, error } = await supabase.rpc("search_players", { q: term });
      if (!live) return;
      setSearching(false);
      if (error) return setErr(t("Kunde inte söka just nu."));
      setErr(null);
      setHits((data as Hit[]) || []);
    }, 300);
    return () => {
      live = false;
      clearTimeout(h);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // Load the cards of the chosen player.
  useEffect(() => {
    if (!sel) {
      setCards(null);
      return;
    }
    let live = true;
    setCards(null);
    // One request returns at most 1000 rows, so page through the result.
    (async () => {
      const all: PCard[] = [];
      for (let from = 0; from < 3000; from += 1000) {
        const { data, error } = await supabase.rpc("player_cards", { p_key: sel.player_key }).range(from, from + 999);
        if (!live) return;
        if (error) return setErr(t("Kunde inte läsa spelarens kort."));
        all.push(...((data as PCard[]) || []));
        if (!data || data.length < 1000) break;
      }
      setErr(null);
      setCards(all);
      // How many parallels of each card are ticked, for the button.
      const counts = new Map<number, number>();
      const favs2 = new Set<number>();
      const wishes2 = new Set<number>();
      const ids = all.map((c) => c.card_id);
      for (let i = 0; i < ids.length; i += 150) {
        const part = ids.slice(i, i + 150);
        const [op, fc, wl] = await Promise.all([
          supabase.from("owned_parallels").select("card_id").in("card_id", part),
          supabase.from("favorite_cards").select("card_id").in("card_id", part),
          supabase.from("wishlist").select("card_id").in("card_id", part),
        ]);
        if (!live) return;
        for (const r of (op.data as { card_id: number }[]) || []) counts.set(r.card_id, (counts.get(r.card_id) || 0) + 1);
        for (const r of (fc.data as { card_id: number }[]) || []) favs2.add(r.card_id);
        for (const r of (wl.data as { card_id: number }[]) || []) wishes2.add(r.card_id);
      }
      setParCounts(counts);
      setFavCards(favs2);
      setWishIds(wishes2);
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel?.player_key]);

  const isFav = !!sel && favs.some((f) => f.player_key === sel.player_key);
  const toggleFav = async () => {
    if (!sel) return;
    if (isFav) {
      setFavs((p) => p.filter((f) => f.player_key !== sel.player_key));
      const { error } = await supabase.from("favorite_players").delete().eq("player_key", sel.player_key);
      if (error) setErr(t("Kunde inte spara."));
    } else {
      setFavs((p) => [sel, ...p]);
      const { error } = await supabase.from("favorite_players").insert({ player_key: sel.player_key, display_name: sel.display_name });
      if (error) {
        setFavs((p) => p.filter((f) => f.player_key !== sel.player_key));
        setErr(t("Kunde inte spara."));
      }
    }
  };

  const tick = async (c: PCard) => {
    const on = c.qty === null;
    setCards((p) => (p || []).map((x) => (x.card_id === c.card_id ? { ...x, qty: on ? 1 : null } : x)));
    const r = on
      ? await supabase.from("owned").upsert({ card_id: c.card_id, set_id: c.set_id }, { onConflict: "user_id,card_id", ignoreDuplicates: true })
      : await supabase.from("owned").delete().eq("card_id", c.card_id);
    if (r.error) {
      setCards((p) => (p || []).map((x) => (x.card_id === c.card_id ? { ...x, qty: c.qty } : x)));
      setErr(t("Kunde inte spara."));
    }
  };

  const flip = (set: (f: (p: Set<number>) => Set<number>) => void, id: number, on: boolean) =>
    set((p) => {
      const n = new Set(p);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  const toggleFavCard = async (c: PCard) => {
    const was = favCards.has(c.card_id);
    flip(setFavCards, c.card_id, !was);
    const r = was ? await supabase.from("favorite_cards").delete().eq("card_id", c.card_id) : await supabase.from("favorite_cards").insert({ card_id: c.card_id, set_id: c.set_id });
    if (r.error) {
      flip(setFavCards, c.card_id, was);
      setErr(t("Kunde inte spara."));
    }
  };
  const toggleWish = async (c: PCard) => {
    const was = wishIds.has(c.card_id);
    flip(setWishIds, c.card_id, !was);
    const r = was
      ? await supabase.from("wishlist").delete().eq("card_id", c.card_id)
      : await supabase.from("wishlist").upsert({ card_id: c.card_id, set_id: c.set_id, priority: 2, max_price: null, note: null }, { onConflict: "user_id,card_id" });
    if (r.error) {
      flip(setWishIds, c.card_id, was);
      setErr(t("Kunde inte spara."));
    }
  };
  // Duplicate toggle: one copy becomes two, and back.
  const toggleDup = async (c: PCard) => {
    const n = (c.qty ?? 0) > 1 ? 1 : 2;
    setCards((p) => (p || []).map((x) => (x.card_id === c.card_id ? { ...x, qty: n } : x)));
    const r = await supabase.from("owned").upsert({ card_id: c.card_id, set_id: c.set_id, qty: n }, { onConflict: "user_id,card_id" });
    if (r.error) {
      setCards((p) => (p || []).map((x) => (x.card_id === c.card_id ? { ...x, qty: c.qty } : x)));
      setErr(t("Kunde inte spara."));
    }
  };
  const traderaScope = (c: PCard): TraderaScope => {
    const words = c.set_name.split(" ").filter(Boolean);
    const brand = words[0] || "";
    const rest = words.slice(1).filter((w) => w.length >= 3 && !/^[\d/.-]+$/.test(w));
    return {
      set: c.set_name,
      card: `${c.section_code ? c.section_code + " " : ""}${c.no} · ${c.name}`,
      narrow: [c.name, brand, ...rest].filter(Boolean).join(" "),
      broad: [c.name, brand].filter(Boolean).join(" "),
    };
  };

  const have = (cards || []).filter((c) => c.qty !== null).length;
  const groups = useMemo(() => {
    const m = new Map<string, { name: string; items: PCard[] }>();
    for (const c of cards || []) {
      if (onlyMissing && c.qty !== null) continue;
      const g = m.get(c.set_id) || { name: c.set_name, items: [] };
      g.items.push(c);
      m.set(c.set_id, g);
    }
    return [...m.entries()];
  }, [cards, onlyMissing]);

  return (
    <div className="t-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="panel tradera pl" role="dialog" aria-modal="true" aria-label={t("Spelare")}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3>{sel ? sel.display_name : t("Spelare")}</h3>
          <div className="row">
            {sel && <button className="btn small ghost" type="button" onClick={() => setSel(null)}>{t("Tillbaka")}</button>}
            <button className="btn small ghost" type="button" onClick={onClose}>{t("Stäng")}</button>
          </div>
        </div>
        {err && <div className="note warn">{err}</div>}

        {!sel && (
          <>
            <input className="t-input" style={{ width: "100%" }} placeholder={t("Sök spelare, till exempel Mats Sundin")} aria-label={t("Sök spelare")} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            {q.trim().length > 0 && q.trim().length < 3 && <div className="note">{t("Skriv minst tre tecken.")}</div>}
            {searching && <div className="note">{t("Söker …")}</div>}
            {hits && !hits.length && !searching && <div className="note">{t("Inga spelare hittades.")}</div>}
            {hits && (
              <div className="pl-list">
                {hits.map((h) => (
                  <button key={h.player_key} type="button" className="pl-row" onClick={() => setSel({ player_key: h.player_key, display_name: h.display_name })}>
                    <b>{h.display_name}</b>
                    <span className="note">{h.cards} {t("baskort")}{(h.variants ?? h.cards) > h.cards ? ` + ${(h.variants ?? h.cards) - h.cards} ${t("paralleller")}` : ""} · {h.sets} {t("set")}</span>
                  </button>
                ))}
              </div>
            )}
            {!hits && (
              <>
                <div className="label" style={{ marginTop: 6 }}>{t("Spelare du följer")}</div>
                {favs.length ? (
                  <div className="pl-list">
                    {favs.map((f) => (
                      <button key={f.player_key} type="button" className="pl-row" onClick={() => setSel(f)}>
                        <b>★ {f.display_name}</b>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="note">{t("Sök en spelare och tryck på stjärnan för att följa honom. Då får du en egen checklista med alla hans kort.")}</div>
                )}
              </>
            )}
          </>
        )}

        {sel && (
          <>
            <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
              <div className="note">
                {cards ? `${t("Du har")} ${have} ${t("av")} ${cards.length} ${t("kort")}` : t("Läser …")}
              </div>
              <div className="row">
                <div className="seg" role="group" aria-label={t("Filter")}>
                  <button type="button" aria-pressed={!onlyMissing} onClick={() => setOnlyMissing(false)}>{t("Alla")}</button>
                  <button type="button" aria-pressed={onlyMissing} onClick={() => setOnlyMissing(true)}>{t("Saknas")}</button>
                </div>
                <button className={`btn small${isFav ? " primary" : ""}`} type="button" aria-pressed={isFav} onClick={toggleFav}>{isFav ? `★ ${t("Följer")}` : `☆ ${t("Följ")}`}</button>
              </div>
            </div>
            {cards && cards.length >= 3000 && <div className="note">{t("Visar de första 3 000 korten.")}</div>}
            {cards && !groups.length && <div className="note">{onlyMissing ? t("Inga saknade kort. Snyggt!") : t("Inga kort hittades.")}</div>}
            <div className="pl-sets">
              {groups.map(([setId, g]) => {
                const got = g.items.filter((c) => c.qty !== null).length;
                return (
                  <div key={setId} className="pl-set">
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <b>{g.name}</b>
                      <button className="btn small ghost" type="button" onClick={() => { onOpenSet(setId); onClose(); }}>{t("Öppna set")}</button>
                    </div>
                    <div className="note">{got}/{g.items.length}</div>
                    {g.items.map((c) => (
                      <div key={c.card_id} className="pl-line">
                        <button type="button" className="pl-card" aria-pressed={c.qty !== null} onClick={() => tick(c)}>
                          <span className="pl-box">{c.qty !== null ? "✓" : ""}</span>
                          <span className="mono">{c.section_code ? c.section_code + " " : ""}{c.no}</span>
                          <span className="grow">{c.section_name}</span>
                          {c.qty !== null && c.qty > 1 && <span className="tag dup">⧉ +{c.qty - 1}</span>}
                        </button>
                        <button type="button" className={`pbtn${parCounts.get(c.card_id) ? " on" : ""}`} title={t("Antal, paralleller och önskelista")} aria-label={`${t("Mer om")} ${c.name}`} onClick={() => setParCard(c)}>{t("Par.")}{parCounts.get(c.card_id) ? ` ${parCounts.get(c.card_id)}` : ""}{wishIds.has(c.card_id) ? " ♡" : ""}</button>
                        <button className={`star${favCards.has(c.card_id) ? " on" : ""}`} type="button" aria-pressed={favCards.has(c.card_id)} title={t("Favorit: extra värdefull")} aria-label={`${c.name}: ${t("Favorit: extra värdefull")}`} onClick={() => toggleFavCard(c)}>{favCards.has(c.card_id) ? "★" : "☆"}</button>
                        <button className={`star wish${wishIds.has(c.card_id) ? " on" : ""}`} type="button" aria-pressed={wishIds.has(c.card_id)} title={t("Önskelista: jag jagar det här kortet")} aria-label={`${c.name}: ${t("Önskelista: jag jagar det här kortet")}`} onClick={() => toggleWish(c)}>{wishIds.has(c.card_id) ? "♥" : "♡"}</button>
                        <button className={`star dup${(c.qty ?? 0) > 1 ? " on" : ""}`} type="button" aria-pressed={(c.qty ?? 0) > 1} title={t("Dubblett: jag har flera av det här kortet")} aria-label={`${c.name}: ${t("Dubblett")}`} onClick={() => toggleDup(c)}>⧉</button>
                        <button className="tbtn" type="button" title={t("Visa sålda på Tradera")} aria-label={`${c.name}: ${t("Visa sålda på Tradera")}`} onClick={() => setTradera(traderaScope(c))}>T</button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>
      {tradera && <TraderaPanel key={tradera.narrow + "|" + tradera.broad} scope={tradera} signedIn onClose={() => setTradera(null)} />}
      {parCard && (
        <PlayerCardPar
          supabase={supabase}
          card={parCard}
          onBaseQty={(n) => setCards((p) => (p || []).map((x) => (x.card_id === parCard.card_id ? { ...x, qty: n > 0 ? n : null } : x)))}
          onParCount={(n) => setParCounts((m) => new Map(m).set(parCard.card_id, n))}
          onWish={(on) => flip(setWishIds, parCard.card_id, on)}
          onClose={() => setParCard(null)}
        />
      )}
    </div>
  );
}
