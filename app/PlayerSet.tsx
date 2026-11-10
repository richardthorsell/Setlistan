"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import "./panels.css";
import { useT } from "@/lib/i18n";
import { ranges, slug } from "@/lib/checklist";
import PlayerCardPar from "./PlayerCardPar";
import TraderaPanel, { type TraderaScope } from "./TraderaPanel";
import EbayPanel from "./EbayPanel";
import Tip from "./Tip";

type Player = { player_key: string; display_name: string };
type PCard = { card_id: number; set_id: string; set_name: string; sport: string | null; section_code: string; section_name: string; no: number; name: string; team: string | null; qty: number | null };
type Filter = "all" | "missing" | "have" | "dups" | "sale" | "incoming" | "wish" | "fav";
type TradeLite = { for_sale: number; incoming: boolean };

const num = (c: PCard) => `${c.section_code ? c.section_code + " " : ""}${c.no}`;

// A followed player opened like a set: every card of the player across all sets, with the same tools as a set.
export default function PlayerSet({
  supabase,
  player,
  onClose,
  onOpenSet,
  say,
}: {
  supabase: SupabaseClient;
  player: Player;
  onClose: () => void;
  onOpenSet: (id: string) => void;
  say: (m: string) => void;
}) {
  const t = useT();
  const [cards, setCards] = useState<PCard[] | null>(null);
  const [follows, setFollows] = useState(true);
  const [parCounts, setParCounts] = useState<Map<number, number>>(new Map());
  const [parExtra, setParExtra] = useState<Map<number, number>>(new Map());
  const [favCards, setFavCards] = useState<Set<number>>(new Set());
  const [wishIds, setWishIds] = useState<Set<number>>(new Set());
  const [trades, setTrades] = useState<Map<number, TradeLite>>(new Map());
  const [filter, setFilter] = useState<Filter>("all");
  const [find, setFind] = useState("");
  const [moreF, setMoreF] = useState(false);
  const [setKey, setSetKey] = useState("");
  const [parCard, setParCard] = useState<PCard | null>(null);
  const [tradera, setTradera] = useState<TraderaScope | null>(null);
  const [ebay, setEbay] = useState<TraderaScope | null>(null);
  const [copyText, setCopyText] = useState<string | null>(null);

  // Parallel counts, favourites, wishes and sale info for some cards. `reset` replaces what was known about them.
  const loadExtras = useCallback(
    async (ids: number[]) => {
      const pc = new Map<number, number>();
      const px = new Map<number, number>();
      const fv = new Set<number>();
      const ws = new Set<number>();
      const tr = new Map<number, TradeLite>();
      for (let i = 0; i < ids.length; i += 150) {
        const part = ids.slice(i, i + 150);
        const [op, fc, wl, ct] = await Promise.all([
          supabase.from("owned_parallels").select("card_id, qty").in("card_id", part),
          supabase.from("favorite_cards").select("card_id").in("card_id", part),
          supabase.from("wishlist").select("card_id").in("card_id", part),
          supabase.from("card_trade").select("card_id, for_sale, incoming").in("card_id", part),
        ]);
        for (const r of (op.data as { card_id: number; qty: number | null }[]) || []) {
          pc.set(r.card_id, (pc.get(r.card_id) || 0) + 1);
          px.set(r.card_id, (px.get(r.card_id) || 0) + Math.max(0, (r.qty ?? 1) - 1));
        }
        for (const r of (fc.data as { card_id: number }[]) || []) fv.add(r.card_id);
        for (const r of (wl.data as { card_id: number }[]) || []) ws.add(r.card_id);
        for (const r of (ct.data as { card_id: number; for_sale: number; incoming: boolean }[]) || []) tr.set(r.card_id, { for_sale: r.for_sale, incoming: r.incoming });
      }
      const merge = <K, V>(prev: Map<K, V>, next: Map<K, V>, keys: number[]) => {
        const m = new Map(prev);
        for (const k of keys) m.delete(k as unknown as K);
        for (const [k, v] of next) m.set(k, v);
        return m;
      };
      const mergeSet = (prev: Set<number>, next: Set<number>) => {
        const s = new Set(prev);
        for (const k of ids) s.delete(k);
        for (const k of next) s.add(k);
        return s;
      };
      setParCounts((p) => merge(p, pc, ids));
      setParExtra((p) => merge(p, px, ids));
      setTrades((p) => merge(p, tr, ids));
      setFavCards((p) => mergeSet(p, fv));
      setWishIds((p) => mergeSet(p, ws));
    },
    [supabase],
  );

  useEffect(() => {
    let live = true;
    setCards(null);
    (async () => {
      const f = await supabase.from("favorite_players").select("player_key").eq("player_key", player.player_key).maybeSingle();
      if (live) setFollows(!!f.data);
      const all: PCard[] = [];
      for (let from = 0; from < 3000; from += 1000) {
        const { data, error } = await supabase.rpc("player_cards", { p_key: player.player_key }).range(from, from + 999);
        if (!live) return;
        if (error) return say(t("Kunde inte läsa spelarens kort."));
        all.push(...((data as PCard[]) || []));
        if (!data || data.length < 1000) break;
      }
      setCards(all);
      await loadExtras(all.map((c) => c.card_id));
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.player_key]);

  const all = useMemo(() => cards || [], [cards]);
  const forSale = (c: PCard) => Math.min(trades.get(c.card_id)?.for_sale ?? 0, c.qty ?? 0);
  const isDup = (c: PCard) => (c.qty ?? 0) - 1 - forSale(c) > 0 || (parExtra.get(c.card_id) ?? 0) > 0;
  const dupExtra = (c: PCard) => Math.max(0, (c.qty ?? 0) - 1 - forSale(c)) + (parExtra.get(c.card_id) ?? 0);
  const passes = (c: PCard, f: Filter) =>
    f === "all" ||
    (f === "missing" && c.qty === null) ||
    (f === "have" && c.qty !== null) ||
    (f === "dups" && isDup(c)) ||
    (f === "sale" && forSale(c) > 0) ||
    (f === "incoming" && !!trades.get(c.card_id)?.incoming) ||
    (f === "wish" && wishIds.has(c.card_id)) ||
    (f === "fav" && favCards.has(c.card_id));

  const have = all.filter((c) => c.qty !== null).length;
  const total = all.length;
  const pct = total ? Math.round((have / total) * 100) : 0;
  const dupCount = all.filter(isDup).length;
  const saleCount = all.filter((c) => forSale(c) > 0).length;
  const incomingCount = all.filter((c) => trades.get(c.card_id)?.incoming).length;

  // Sets that hold cards of this player, in name order.
  const setList = useMemo(() => {
    const m = new Map<string, { name: string; items: PCard[] }>();
    for (const c of all) {
      const g = m.get(c.set_id) || { name: c.set_name, items: [] };
      g.items.push(c);
      m.set(c.set_id, g);
    }
    return [...m.entries()];
  }, [all]);

  const q = find.trim().toLowerCase();
  const groups = setList
    .filter(([id]) => !setKey || id === setKey)
    .map(([id, g]) => [id, { name: g.name, items: g.items.filter((c) => passes(c, filter) && (!q || `${g.name} ${c.section_name} ${num(c)}`.toLowerCase().includes(q))) }] as const)
    .filter(([, g]) => g.items.length);
  const shown = groups.reduce((n, [, g]) => n + g.items.length, 0);

  // ----- changes -----
  const flip = (set: (f: (p: Set<number>) => Set<number>) => void, id: number, on: boolean) =>
    set((p) => {
      const n = new Set(p);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  const fail = () => say(t("Kunde inte spara."));
  const tick = async (c: PCard) => {
    const on = c.qty === null;
    setCards((p) => (p || []).map((x) => (x.card_id === c.card_id ? { ...x, qty: on ? 1 : null } : x)));
    const r = on
      ? await supabase.from("owned").upsert({ card_id: c.card_id, set_id: c.set_id }, { onConflict: "user_id,card_id", ignoreDuplicates: true })
      : await supabase.from("owned").delete().eq("card_id", c.card_id);
    if (r.error) {
      setCards((p) => (p || []).map((x) => (x.card_id === c.card_id ? { ...x, qty: c.qty } : x)));
      fail();
    }
  };
  const toggleFavCard = async (c: PCard) => {
    const was = favCards.has(c.card_id);
    flip(setFavCards, c.card_id, !was);
    const r = was ? await supabase.from("favorite_cards").delete().eq("card_id", c.card_id) : await supabase.from("favorite_cards").insert({ card_id: c.card_id, set_id: c.set_id });
    if (r.error) {
      flip(setFavCards, c.card_id, was);
      fail();
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
      fail();
    }
  };
  const toggleDup = async (c: PCard) => {
    const n = (c.qty ?? 0) > 1 ? 1 : 2;
    setCards((p) => (p || []).map((x) => (x.card_id === c.card_id ? { ...x, qty: n } : x)));
    const r = await supabase.from("owned").upsert({ card_id: c.card_id, set_id: c.set_id, qty: n }, { onConflict: "user_id,card_id" });
    if (r.error) {
      setCards((p) => (p || []).map((x) => (x.card_id === c.card_id ? { ...x, qty: c.qty } : x)));
      fail();
    }
  };
  const toggleFollow = async () => {
    const was = follows;
    setFollows(!was);
    const r = was ? await supabase.from("favorite_players").delete().eq("player_key", player.player_key) : await supabase.from("favorite_players").insert({ player_key: player.player_key, display_name: player.display_name });
    if (r.error) {
      setFollows(was);
      fail();
    }
  };

  // ----- searches on Tradera and eBay -----
  const scopeOf = (c?: PCard): TraderaScope => {
    const brand = c ? c.set_name.split(" ").filter(Boolean)[0] || "" : "";
    const rest = c ? c.set_name.split(" ").filter(Boolean).slice(1).filter((w) => w.length >= 3 && !/^[\d/.-]+$/.test(w)) : [];
    return {
      set: c ? c.set_name : player.display_name,
      card: c ? `${num(c)} · ${c.name}` : null,
      narrow: [player.display_name, brand, ...rest].filter(Boolean).join(" "),
      broad: [player.display_name, brand].filter(Boolean).join(" "),
    };
  };

  // ----- lists, files and links -----
  const missingText = () => {
    const lines = [`${player.display_name} — ${t("saknade kort")}`];
    for (const [, g] of setList) {
      const secs = new Map<string, PCard[]>();
      for (const c of g.items) if (c.qty === null) (secs.get(`${c.section_name}\u0000${c.section_code}`) || secs.set(`${c.section_name}\u0000${c.section_code}`, []).get(`${c.section_name}\u0000${c.section_code}`)!).push(c);
      for (const [k, list] of secs) {
        const [name, code] = k.split("\u0000");
        lines.push(`${g.name} · ${name}${code ? ` (${code})` : ""}, ${list.length} ${t("st")}: ${ranges(list.map((c) => c.no))}`);
      }
    }
    return lines.length > 1 ? lines.join("\n") : `${player.display_name}: ${t("komplett!")}`;
  };
  const copyMissing = async () => {
    const text = missingText();
    try {
      await navigator.clipboard.writeText(text);
      say(t("Saknade kort kopierade"));
    } catch {
      setCopyText(text);
    }
  };
  const downloadCsv = (onlyMissing: boolean) => {
    const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
    const rows = [t("Set,Nummer,Delset,Spelare,Lag,Har,Antal")];
    for (const c of all) {
      if (onlyMissing && c.qty !== null) continue;
      rows.push([esc(c.set_name), esc(num(c)), esc(c.section_name), esc(c.name), esc(c.team || ""), c.qty !== null ? t("Ja") : t("Nej"), String(c.qty ?? 0)].join(","));
    }
    const url = URL.createObjectURL(new Blob(["﻿" + rows.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug(player.display_name)}-${onlyMissing ? "saknade" : "kortlista"}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const shareList = async (kind: "missing" | "dups") => {
    const sel = await supabase.from("shared_lists").select("token").eq("player_key", player.player_key).eq("kind", kind).maybeSingle();
    let token = sel.data?.token as string | undefined;
    if (!token) {
      const ins = await supabase.from("shared_lists").insert({ player_key: player.player_key, player_name: player.display_name, kind }).select("token").single();
      token = ins.data?.token as string | undefined;
    }
    if (!token) return say(t("Kunde inte skapa länken."));
    const url = `${location.origin}/l/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      say(t("Länken är kopierad. Den visar bara kortlistan, ingen personinfo."));
    } catch {
      setCopyText(url);
    }
  };
  const unshareLists = async () => {
    const { error } = await supabase.from("shared_lists").delete().eq("player_key", player.player_key);
    say(error ? t("Kunde inte stänga av länkarna.") : t("Delningslänkarna för setet är avstängda."));
  };

  const filterLabels: Record<Filter, string> = {
    all: t("Alla"),
    missing: t("Saknas"),
    have: t("Har"),
    fav: `★ ${t("Favoriter")}${favCards.size ? ` ${favCards.size}` : ""}`,
    dups: `${t("Dubbletter")}${dupCount ? ` ${dupCount}` : ""}`,
    sale: `${t("Till salu")}${saleCount ? ` ${saleCount}` : ""}`,
    incoming: `${t("På väg")}${incomingCount ? ` ${incomingCount}` : ""}`,
    wish: `♡ ${t("Önskas")}${wishIds.size ? ` ${wishIds.size}` : ""}`,
  };

  return (
    <section className="set" id="set">
      <div className="set-head">
        <div>
          <div className="label">{t("Spelare")} · {t("Alla set")}</div>
          <h2>{player.display_name}</h2>
          <div className="row">
            <button className="btn small" type="button" aria-pressed={follows} onClick={toggleFollow}>{follows ? `★ ${t("Följer")}` : `☆ ${t("Följ")}`}</button>
            <button className="btn small ghost" type="button" onClick={onClose}>{t("Stäng")}</button>
          </div>
          <div className="sub">{setList.length} {t("set")} · {total} {t("kort")}</div>
        </div>
        <div className="tally">
          <div className="num mono">{have}<small> / {total}</small></div>
          <div className="label">{total - have} {t("saknas")} · {pct} %</div>
        </div>
      </div>
      <div className="bar big-bar"><i style={{ width: `${pct}%` }} /></div>
      <div className="minibar" aria-hidden="true">
        <b className="mono">{have}/{total}</b>
        <span className="bar"><i style={{ width: `${pct}%` }} /></span>
        <span className="mono">{pct} %</span>
      </div>
      <Tip id="player">{t("Det här är alla spelarens kort i alla set. Tryck på ett kort för att markera det. Följ spelaren så ligger han kvar på startsidan.")}</Tip>
      <div className="actions">
        <details className="menu" onClick={(e) => { if ((e.target as HTMLElement).closest(".menu-pop button")) e.currentTarget.removeAttribute("open"); }}>
          <summary className="btn">{t("Exportera och dela")}</summary>
          <div className="menu-pop left">
            <button type="button" onClick={copyMissing}>{t("Kopiera saknade")}</button>
            <button type="button" onClick={() => downloadCsv(true)}>{t("Ladda ner saknade (CSV)")}</button>
            <button type="button" onClick={() => downloadCsv(false)}>{t("Ladda ner hela setlistan")}</button>
            <button type="button" onClick={() => shareList("missing")}>{t("Dela saknade som länk")}</button>
            {dupCount > 0 && <button type="button" onClick={() => shareList("dups")}>{t("Dela dubbletter som länk")}</button>}
            <button type="button" onClick={unshareLists}>{t("Stäng av delning")}</button>
            <button type="button" onClick={() => setTradera(scopeOf())}>{t("Sålda på Tradera")}</button>
            <button type="button" onClick={() => setEbay(scopeOf())}>{t("Auktioner på eBay")}</button>
          </div>
        </details>
      </div>      {copyText && (
        <div className="panel">
          <div className="note">{t("Kopiera texten nedan:")}</div>
          <textarea readOnly value={copyText} onFocus={(e) => e.target.select()} autoFocus />
        </div>
      )}

      <div className="sections" role="toolbar" aria-label={t("Set")}>
        {setList.map(([id, g]) => {
          const hs = g.items.filter((c) => c.qty !== null).length;
          return (
            <button key={id} className={`sec ${hs === g.items.length && hs ? "done" : ""}`} type="button" aria-pressed={setKey === id} onClick={() => setSetKey(id)}>
              <b>{g.name}</b>
              <small>{hs}/{g.items.length}</small>
            </button>
          );
        })}
        <button className="sec" type="button" aria-pressed={setKey === ""} onClick={() => setSetKey("")}>
          <b>{t("Alla set")}</b>
          <small>{have}/{total}</small>
        </button>
      </div>

      <div className="controls">
        <div className="seg" role="group" aria-label={t("Visa")}>
          {(["all", "missing", "have", ...(moreF || !["all", "missing", "have"].includes(filter) ? ["dups", "sale", "incoming", "wish", "fav"] : [])] as Filter[]).map((k) => (
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{filterLabels[k]}</button>
          ))}
          <button type="button" aria-pressed={moreF} onClick={() => setMoreF((v) => !v)}>{moreF ? t("Färre") : t("Fler")}</button>
        </div>
        <input type="search" placeholder={t("Set, delset eller nummer")} value={find} onChange={(e) => setFind(e.target.value)} aria-label={t("Sök bland korten")} />
      </div>

      {!cards ? (
        <div className="empty">{t("Läser korten …")}</div>
      ) : !shown ? (
        <div className="empty">{filter === "missing" ? t("Inga saknade kort här. Snyggt!") : t("Inga kort matchar sökningen.")}</div>
      ) : (
        groups.map(([id, g]) => (
          <div key={id} className="pl-group">
            <div className="row" style={{ justifyContent: "space-between", margin: "14px 0 4px" }}>
              <b>{g.name}</b>
              <button className="btn small ghost" type="button" onClick={() => onOpenSet(id)}>{t("Öppna set")}</button>
            </div>
            <div className="list">
              {g.items.map((c) => (
                <div key={c.card_id} className="lwrap">
                  <button className="lrow" type="button" aria-pressed={c.qty !== null} onClick={() => tick(c)}>
                    <span className="box">{c.qty !== null ? "✓" : ""}</span>
                    <span className="n">{num(c)}</span>
                    <span className="nm">
                      {c.section_name}
                      {isDup(c) && <span className="tag dup" title={`${dupExtra(c)} ${t("Dubbletter").toLowerCase()}`}> ⧉ +{dupExtra(c)}</span>}
                      {forSale(c) > 0 && <span className="tag sale"> {t("Till salu")} ×{forSale(c)}</span>}
                      {trades.get(c.card_id)?.incoming && <span className="tag inc"> {t("På väg")}</span>}
                    </span>
                    <span className="tm">{c.team}</span>
                  </button>
                  <button className={`pbtn${parCounts.get(c.card_id) || wishIds.has(c.card_id) ? " on" : ""}`} type="button" title={t("Antal, paralleller och önskelista")} aria-label={`${t("Mer om")} ${c.name}`} onClick={() => setParCard(c)}>{t("Par.")}{parCounts.get(c.card_id) ? ` ${parCounts.get(c.card_id)}` : ""}{wishIds.has(c.card_id) ? " ♡" : ""}</button>
                  <button className={`star${favCards.has(c.card_id) ? " on" : ""}`} type="button" aria-pressed={favCards.has(c.card_id)} title={t("Favorit: extra värdefull")} aria-label={`${c.name}: ${t("Favorit: extra värdefull")}`} onClick={() => toggleFavCard(c)}>{favCards.has(c.card_id) ? "★" : "☆"}</button>
                  <button className={`star wish xtra${wishIds.has(c.card_id) ? " on" : ""}`} type="button" aria-pressed={wishIds.has(c.card_id)} title={t("Önskelista: jag jagar det här kortet")} aria-label={`${c.name}: ${t("Önskelista: jag jagar det här kortet")}`} onClick={() => toggleWish(c)}>{wishIds.has(c.card_id) ? "♥" : "♡"}</button>
                  <button className={`star dup xtra${(c.qty ?? 0) > 1 ? " on" : ""}`} type="button" aria-pressed={(c.qty ?? 0) > 1} title={t("Dubblett: jag har flera av det här kortet")} aria-label={`${c.name}: ${t("Dubblett")}`} onClick={() => ((c.qty ?? 0) > 2 ? setParCard(c) : toggleDup(c))}>⧉</button>
                  <button className="tbtn xtra" type="button" title={t("Visa sålda på Tradera")} aria-label={`${c.name}: ${t("Visa sålda på Tradera")}`} onClick={() => setTradera(scopeOf(c))}>T</button>
                  <button className="tbtn xtra" type="button" title={t("Auktioner på eBay")} aria-label={`${c.name}: ${t("Auktioner på eBay")}`} onClick={() => setEbay(scopeOf(c))}>E</button>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
      {cards && cards.length >= 3000 && <div className="note">{t("Visar de första 3 000 korten.")}</div>}

      {tradera && <TraderaPanel key={tradera.narrow + "|" + tradera.set} scope={tradera} signedIn onClose={() => setTradera(null)} />}
      {ebay && <EbayPanel key={ebay.narrow + "|" + ebay.set} scope={ebay} signedIn onClose={() => setEbay(null)} />}
      {parCard && (
        <PlayerCardPar
          supabase={supabase}
          card={parCard}
          onBaseQty={(n) => setCards((p) => (p || []).map((x) => (x.card_id === parCard.card_id ? { ...x, qty: n > 0 ? n : null } : x)))}
          onParCount={(n) => setParCounts((m) => new Map(m).set(parCard.card_id, n))}
          onWish={(on) => flip(setWishIds, parCard.card_id, on)}
          onTradera={() => setTradera(scopeOf(parCard))}
          onEbay={() => setEbay(scopeOf(parCard))}
          onClose={() => {
            const id = parCard.card_id;
            setParCard(null);
            loadExtras([id]);
          }}
        />
      )}
    </section>
  );
}
