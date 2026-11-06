"use client";

import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import "./panels.css";
import { useT } from "@/lib/i18n";

type Hit = { player_key: string; display_name: string; cards: number; sets: number };
type Fav = { player_key: string; display_name: string };
type PCard = { card_id: number; set_id: string; set_name: string; sport: string | null; section_code: string; section_name: string; no: number; name: string; team: string | null; qty: number | null };

// Search a player across all sets, follow him, and see every card of his with have/missing.
export default function PlayerPanel({ supabase, onClose, onOpenSet }: { supabase: SupabaseClient; onClose: () => void; onOpenSet: (id: string) => void }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [favs, setFavs] = useState<Fav[]>([]);
  const [sel, setSel] = useState<Fav | null>(null);
  const [cards, setCards] = useState<PCard[] | null>(null);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
      if (e.key !== "Escape") return;
      if (sel) setSel(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, sel]);

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
    supabase.rpc("player_cards", { p_key: sel.player_key }).then(({ data, error }) => {
      if (!live) return;
      if (error) return setErr(t("Kunde inte läsa spelarens kort."));
      setErr(null);
      setCards((data as PCard[]) || []);
    });
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
                    <span className="note">{h.cards} {t("kort")} · {h.sets} {t("set")}</span>
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
                      <button key={c.card_id} type="button" className="pl-card" aria-pressed={c.qty !== null} onClick={() => tick(c)}>
                        <span className="pl-box">{c.qty !== null ? "✓" : ""}</span>
                        <span className="mono">{c.section_code ? c.section_code + " " : ""}{c.no}</span>
                        <span className="grow">{c.section_name}</span>
                        {c.qty !== null && c.qty > 1 && <span className="tag dup">⧉ +{c.qty - 1}</span>}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
