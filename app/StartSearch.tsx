"use client";

import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import "./panels.css";
import { useT } from "@/lib/i18n";
import { SPORTS, type SetStat, sportLabel } from "@/lib/checklist";

type Hit = { player_key: string; display_name: string; cards: number; sets: number; variants?: number };

// One search box for the start page: players and sets in two groups, with a sport filter that covers both.
export default function StartSearch({
  supabase,
  sets,
  onOpenPlayer,
  onOpenSet,
}: {
  supabase: SupabaseClient;
  sets: SetStat[];
  onOpenPlayer: (p: { player_key: string; display_name: string }) => void;
  onOpenSet: (id: string) => void;
}) {
  const t = useT();
  const [q, setQ] = useState("");
  const [sport, setSport] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const term = q.trim();
  const used = useMemo(() => SPORTS.filter((s) => sets.some((x) => x.sport === s.id)), [sets]);

  useEffect(() => {
    if (term.length < 3) {
      setHits(null);
      setBusy(false);
      return;
    }
    let live = true;
    setBusy(true);
    const h = setTimeout(async () => {
      const { data, error } = await supabase.rpc("search_players", { q: term, p_sport: sport || null });
      if (!live) return;
      setBusy(false);
      setHits(error ? [] : ((data as Hit[]) || []).map((x) => ({ ...x, cards: Number(x.cards), sets: Number(x.sets), variants: x.variants === undefined ? undefined : Number(x.variants) })));
    }, 300);
    return () => {
      live = false;
      clearTimeout(h);
    };
  }, [term, sport, supabase]);

  const ql = term.toLowerCase();
  const setMatches = ql.length >= 3 ? sets.filter((s) => (!sport || s.sport === sport) && s.name.toLowerCase().includes(ql)).slice(0, 8) : [];
  const done = () => setQ("");

  return (
    <div className="start-search">
      <input type="search" className="hero-input" placeholder={t("Sök spelare eller set")} aria-label={t("Sök spelare eller set")} value={q} onChange={(e) => setQ(e.target.value)} />
      {used.length > 1 && (
        <div className="seg" role="group" aria-label={t("Sport")}>
          <button type="button" aria-pressed={sport === ""} onClick={() => setSport("")}>{t("Alla sporter")}</button>
          {used.map((s) => (
            <button key={s.id} type="button" aria-pressed={sport === s.id} onClick={() => setSport(s.id)}>{t(s.label)}</button>
          ))}
        </div>
      )}
      {term.length > 0 && term.length < 3 && <div className="note">{t("Skriv minst tre tecken.")}</div>}
      {busy && <div className="note">{t("Söker …")}</div>}
      {term.length >= 3 && (
        <div className="start-results">
          {hits && hits.length > 0 && (
            <>
              <div className="label">{t("Spelare")}</div>
              <div className="pl-list">
                {hits.map((h) => (
                  <button key={h.player_key} type="button" className="pl-row" onClick={() => { onOpenPlayer({ player_key: h.player_key, display_name: h.display_name }); done(); }}>
                    <b>{h.display_name}</b>
                    <span className="note">{h.cards} {t("baskort")}{(h.variants ?? h.cards) > h.cards ? ` + ${(h.variants ?? h.cards) - h.cards} ${t("paralleller")}` : ""} · {h.sets} {t("set")}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {setMatches.length > 0 && (
            <>
              <div className="label">{t("Set")}</div>
              <div className="pl-list">
                {setMatches.map((s) => (
                  <button key={s.id} type="button" className="pl-row" onClick={() => { onOpenSet(s.id); done(); }}>
                    <b>{s.name}</b>
                    <span className="note">{t(sportLabel(s.sport))}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {!busy && hits && !hits.length && !setMatches.length && <div className="note">{t("Inget hittades.")}</div>}
        </div>
      )}
    </div>
  );
}
