"use client";

import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import "./panels.css";
import { useT } from "@/lib/i18n";
import { type Parallel, parallelLabel } from "@/lib/checklist";
import { Stepper } from "./CardPar";

type Hit = { player_key: string; display_name: string; cards: number; sets: number; variants?: number };
type Fav = { player_key: string; display_name: string };
type PCard = { card_id: number; set_id: string; set_name: string; sport: string | null; section_id: number; section_code: string; section_name: string; no: number; name: string; team: string | null; qty: number | null };

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
  // Parallels per set, the player's owned parallels ("cardId:parallelId" -> serial and copies) and the card that is unfolded.
  const [parBySet, setParBySet] = useState<Map<string, Parallel[]>>(new Map());
  const [ownedPar, setOwnedPar] = useState<Map<string, { serial: string | null; qty: number }>>(new Map());
  const [openCard, setOpenCard] = useState<number | null>(null);

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
      loadParallels(all, () => live);
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel?.player_key]);

  // Parallels of the sets the player appears in, plus which of them the user already owns.
  const loadParallels = async (list: PCard[], live: () => boolean) => {
    const pages = async <T,>(build: (a: number, b: number) => PromiseLike<{ data: T[] | null; error: unknown }>) => {
      const out: T[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await build(from, from + 999);
        if (error) throw error;
        out.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      return out;
    };
    const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
    try {
      const setIds = [...new Set(list.map((c) => c.set_id))];
      const cardIds = list.map((c) => c.card_id);
      const [pars, mine] = await Promise.all([
        Promise.all(chunk(setIds, 40).map((ids) => pages<Parallel & { set_id: string }>((a, b) => supabase.from("parallels").select("id, set_id, section_id, name, print_run, position").in("set_id", ids).order("position").order("id").range(a, b)))),
        Promise.all(chunk(cardIds, 200).map((ids) => pages<{ card_id: number; parallel_id: number; serial: string | null; qty: number }>((a, b) => supabase.from("owned_parallels").select("card_id, parallel_id, serial, qty").in("card_id", ids).order("card_id").order("parallel_id").range(a, b)))),
      ]);
      if (!live()) return;
      const bySet = new Map<string, Parallel[]>();
      for (const p of pars.flat()) (bySet.get(p.set_id) || bySet.set(p.set_id, []).get(p.set_id)!).push(p);
      setParBySet(bySet);
      setOwnedPar(new Map(mine.flat().map((r) => [`${r.card_id}:${r.parallel_id}`, { serial: r.serial, qty: r.qty ?? 1 }])));
    } catch {
      if (live()) setErr(t("Kunde inte läsa parallellerna."));
    }
  };

  // Parallels that exist for a card: set-wide ones plus the ones of its own subset.
  const parsOf = (c: PCard) => (parBySet.get(c.set_id) || []).filter((p) => p.section_id === null || p.section_id === c.section_id);
  const ownedCount = (c: PCard) => parsOf(c).filter((p) => ownedPar.has(`${c.card_id}:${p.id}`)).length;

  const toggleParallel = async (c: PCard, pid: number, on: boolean) => {
    const key = `${c.card_id}:${pid}`;
    const before = ownedPar.get(key);
    setOwnedPar((m) => {
      const n = new Map(m);
      if (on) n.set(key, { serial: null, qty: 1 });
      else n.delete(key);
      return n;
    });
    const r = on
      ? await supabase.from("owned_parallels").upsert({ card_id: c.card_id, parallel_id: pid, set_id: c.set_id }, { onConflict: "user_id,card_id,parallel_id", ignoreDuplicates: true })
      : await supabase.from("owned_parallels").delete().eq("parallel_id", pid).eq("card_id", c.card_id);
    if (r.error) {
      setOwnedPar((m) => {
        const n = new Map(m);
        if (before) n.set(key, before);
        else n.delete(key);
        return n;
      });
      setErr(t("Kunde inte spara."));
    }
  };

  const saveSerial = async (c: PCard, pid: number, value: string) => {
    const key = `${c.card_id}:${pid}`;
    const cur = ownedPar.get(key);
    const serial = value.trim() || null;
    if (!cur || cur.serial === serial) return;
    setOwnedPar((m) => new Map(m).set(key, { ...cur, serial }));
    const { error } = await supabase.from("owned_parallels").update({ serial }).eq("card_id", c.card_id).eq("parallel_id", pid);
    if (error) {
      setOwnedPar((m) => new Map(m).set(key, cur));
      setErr(t("Kunde inte spara."));
    }
  };

  const saveQty = async (c: PCard, pid: number, n: number) => {
    const key = `${c.card_id}:${pid}`;
    const cur = ownedPar.get(key);
    if (!cur || n < 1) return;
    setOwnedPar((m) => new Map(m).set(key, { ...cur, qty: n }));
    const { error } = await supabase.from("owned_parallels").update({ qty: n }).eq("card_id", c.card_id).eq("parallel_id", pid);
    if (error) {
      setOwnedPar((m) => new Map(m).set(key, cur));
      setErr(t("Kunde inte spara."));
    }
  };

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
                    {g.items.map((c) => {
                      const opts = parsOf(c);
                      const nOwned = ownedCount(c);
                      const open = openCard === c.card_id;
                      return (
                        <div key={c.card_id} className="pl-item">
                          <div className="pl-line">
                            <button type="button" className="pl-card" aria-pressed={c.qty !== null} onClick={() => tick(c)}>
                              <span className="pl-box">{c.qty !== null ? "✓" : ""}</span>
                              <span className="mono">{c.section_code ? c.section_code + " " : ""}{c.no}</span>
                              <span className="grow">{c.section_name}</span>
                              {c.qty !== null && c.qty > 1 && <span className="tag dup">⧉ +{c.qty - 1}</span>}
                            </button>
                            {opts.length > 0 && (
                              <button type="button" className={`btn small${nOwned ? " primary" : ""}`} aria-expanded={open} aria-label={`${t("Paralleller")}: ${c.section_name} ${c.no}`} onClick={() => setOpenCard(open ? null : c.card_id)}>
                                {t("Par.")}{nOwned ? ` ${nOwned}` : ""}
                              </button>
                            )}
                          </div>
                          {open && (
                            <div className="par-list pl-pars">
                              {opts.map((p) => {
                                const key = `${c.card_id}:${p.id}`;
                                const o = ownedPar.get(key);
                                return (
                                  <div key={p.id} className="par-row">
                                    <label className="check">
                                      <input type="checkbox" checked={!!o} onChange={(e) => toggleParallel(c, p.id, e.target.checked)} />
                                      <span>{parallelLabel(p)}</span>
                                    </label>
                                    {o && (
                                      <>
                                        <input
                                          key={o.serial ?? ""}
                                          className="serial"
                                          defaultValue={o.serial ?? ""}
                                          placeholder={p.print_run ? `nr/${p.print_run}` : "nr"}
                                          maxLength={20}
                                          aria-label={`${t("Serienummer för")} ${parallelLabel(p)}`}
                                          onBlur={(e) => saveSerial(c, p.id, e.target.value)}
                                        />
                                        <Stepper value={o.qty} min={1} onChange={(n) => saveQty(c, p.id, n)} label={t("Antal")} />
                                      </>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
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
