"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import "./panels.css";
import { useT } from "@/lib/i18n";

type Hit = { player_key: string; display_name: string; cards: number; sets: number; variants?: number };
type Fav = { player_key: string; display_name: string };

// Search a player across all sets, or pick one you follow. A chosen player opens like a set on the start page.
export default function PlayerPanel({ supabase, initialQ = "", sets, onOpenSet, onClose, onOpenPlayer }: { supabase: SupabaseClient; initialQ?: string; sets: { id: string; name: string }[]; onOpenSet: (id: string) => void; onClose: () => void; onOpenPlayer: (p: Fav) => void }) {
  const t = useT();
  const [q, setQ] = useState(initialQ);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [favs, setFavs] = useState<Fav[]>([]);
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
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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

  // Sets whose name matches the search, so one box finds both players and sets.
  const ql = q.trim().toLowerCase();
  const setHits = ql.length >= 3 ? sets.filter((s) => s.name.toLowerCase().includes(ql)).slice(0, 8) : [];

  return (
    <div className="t-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="panel tradera pl" role="dialog" aria-modal="true" aria-label={t("Spelare")}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3>{t("Spelare")}</h3>
          <button className="btn small ghost" type="button" onClick={onClose}>{t("Stäng")}</button>
        </div>
        {err && <div className="note warn">{err}</div>}
        <input className="t-input" style={{ width: "100%" }} placeholder={t("Sök spelare, till exempel Mats Sundin")} aria-label={t("Sök spelare")} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        {q.trim().length > 0 && q.trim().length < 3 && <div className="note">{t("Skriv minst tre tecken.")}</div>}
        {searching && <div className="note">{t("Söker …")}</div>}
        {hits && !hits.length && !searching && !setHits.length && <div className="note">{t("Inga spelare hittades.")}</div>}
        {hits && (
          <div className="pl-list">
            {hits.map((h) => (
              <button key={h.player_key} type="button" className="pl-row" onClick={() => onOpenPlayer({ player_key: h.player_key, display_name: h.display_name })}>
                <b>{h.display_name}</b>
                <span className="note">{h.cards} {t("baskort")}{(h.variants ?? h.cards) > h.cards ? ` + ${(h.variants ?? h.cards) - h.cards} ${t("paralleller")}` : ""} · {h.sets} {t("set")}</span>
              </button>
            ))}
          </div>
        )}
        {setHits.length > 0 && (
          <>
            <div className="label" style={{ marginTop: 6 }}>{t("Set")}</div>
            <div className="pl-list">
              {setHits.map((s) => (
                <button key={s.id} type="button" className="pl-row" onClick={() => onOpenSet(s.id)}>
                  <b>{s.name}</b>
                </button>
              ))}
            </div>
          </>
        )}
        {!hits && !setHits.length && (
          <>
            <div className="label" style={{ marginTop: 6 }}>{t("Spelare du följer")}</div>
            {favs.length ? (
              <div className="pl-list">
                {favs.map((f) => (
                  <button key={f.player_key} type="button" className="pl-row" onClick={() => onOpenPlayer(f)}>
                    <b>★ {f.display_name}</b>
                  </button>
                ))}
              </div>
            ) : (
              <div className="note">{t("Sök en spelare och tryck på stjärnan för att följa honom. Då får du en egen checklista med alla hans kort.")}</div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
