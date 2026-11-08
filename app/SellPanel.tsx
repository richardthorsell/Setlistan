"use client";

import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import "./panels.css";
import { useT } from "@/lib/i18n";

type Row = { id: number; set: string; code: string; no: number; name: string; team: string; qty: number };
type Pick = { cond: string; price: string };
type Platform = "facebook" | "tradera" | "ebay" | "text";
type Block = { key: string; title?: string; meta?: string; body: string };

const CONDS = [
  { id: "M", sv: "Mint", en: "Mint" },
  { id: "NM", sv: "Near Mint", en: "Near Mint" },
  { id: "EX", sv: "Mycket bra skick", en: "Excellent" },
  { id: "G", sv: "Bra skick", en: "Good" },
  { id: "P", sv: "Använt skick", en: "Played" },
];
const cond = (id: string) => CONDS.find((c) => c.id === id) || CONDS[1];
const priceOf = (s: string) => {
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};
const tag = (r: Row) => `${r.code ? r.code + " " : ""}${r.no}`;

// Pick cards (by default your duplicates), set condition and price, and get a ready-made sales post
// for Facebook, Tradera or eBay to paste next to your own photos. Nothing here is saved.
export default function SellPanel({ supabase, onClose }: { supabase: SupabaseClient; onClose: () => void }) {
  const t = useT();
  const [showAll, setShowAll] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [find, setFind] = useState("");
  const [sel, setSel] = useState<Record<number, Pick>>({});
  const [hint, setHint] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [platform, setPlatform] = useState<Platform>("facebook");
  const [extra, setExtra] = useState("Frakt 25 kr. Samfrakt vid flera kort.");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let live = true;
    setRows(null);
    (async () => {
      const all: Row[] = [];
      for (let from = 0; from < 5000; from += 1000) {
        let q = supabase.from("owned").select("card_id, qty, cards(no, name, team, sections(code, name)), sets(name)");
        if (!showAll) q = q.gt("qty", 1);
        const { data, error } = await q.order("card_id").range(from, from + 999);
        if (!live) return;
        if (error) {
          setErr(t("Kunde inte läsa dina kort."));
          setRows([]);
          return;
        }
        for (const o of ((data as any[]) || [])) {
          const c = Array.isArray(o.cards) ? o.cards[0] : o.cards;
          const s = Array.isArray(o.sets) ? o.sets[0] : o.sets;
          const sec = c && (Array.isArray(c.sections) ? c.sections[0] : c.sections);
          if (!c) continue;
          all.push({ id: o.card_id, set: s?.name || "", code: sec?.code || "", no: c.no, name: c.name || "", team: c.team || "", qty: o.qty || 1 });
        }
        if (!data || data.length < 1000) break;
      }
      all.sort((a, b) => a.set.localeCompare(b.set, "sv") || a.code.localeCompare(b.code) || a.no - b.no);
      setErr(null);
      setRows(all);
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAll]);

  const shown = useMemo(() => {
    const w = find.toLowerCase().split(" ").filter(Boolean);
    return (rows || []).filter((r) => {
      const hay = `${r.set} ${r.name} ${r.team} ${tag(r)}`.toLowerCase();
      return w.every((x) => hay.includes(x));
    });
  }, [rows, find]);

  const toggle = (r: Row) =>
    setSel((p) => {
      const n = { ...p };
      if (n[r.id]) delete n[r.id];
      else n[r.id] = { cond: "NM", price: "" };
      return n;
    });
  const patch = (id: number, v: Partial<Pick>) => setSel((p) => ({ ...p, [id]: { ...p[id], ...v } }));

  const suggest = async (r: Row) => {
    setBusyId(r.id);
    try {
      const q = `${r.name} ${r.set.split(" ")[0]}`.slice(0, 100);
      const res = await fetch("/api/tradera?q=" + encodeURIComponent(q) + "&ctx=" + encodeURIComponent(r.set));
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.stats?.median) {
        patch(r.id, { price: String(Math.round(j.stats.median)) });
        setHint((h) => ({ ...h, [r.id]: `${t("Median från")} ${j.stats.count} ${t("sålda på Tradera")}` }));
      } else {
        setHint((h) => ({ ...h, [r.id]: j.error || t("Hittade inga sålda att utgå från.") }));
      }
    } catch {
      setHint((h) => ({ ...h, [r.id]: t("Det gick inte att nå Tradera just nu.") }));
    } finally {
      setBusyId(null);
    }
  };

  const items = useMemo(() => (rows || []).filter((r) => sel[r.id]), [rows, sel]);

  const blocks: Block[] = useMemo(() => {
    if (!items.length) return [];
    const sum = items.reduce((n, r) => n + (priceOf(sel[r.id].price) ?? 0), 0);
    const allPriced = items.every((r) => priceOf(sel[r.id].price) !== null);
    const line = (r: Row) => {
      const p = priceOf(sel[r.id].price);
      return `• ${tag(r)} ${r.name}${r.team ? ", " + r.team : ""} – ${cond(sel[r.id].cond).sv}${p !== null ? ` – ${p} kr` : ""}`;
    };
    if (platform === "facebook" || platform === "text") {
      const sets = [...new Set(items.map((r) => r.set))];
      const body = sets.map((s) => `${s}\n${items.filter((r) => r.set === s).map(line).join("\n")}`).join("\n\n");
      const head = platform === "facebook" ? "Säljer samlarkort\n\n" : "";
      const tail = [allPriced && items.length > 1 ? `Totalt ${sum} kr.` : "", extra.trim(), platform === "facebook" ? "Skriv en kommentar eller DM om du är intresserad!" : ""].filter(Boolean).join("\n");
      return [{ key: "one", body: `${head}${body}${tail ? "\n\n" + tail : ""}` }];
    }
    return items.map((r) => {
      const c = cond(sel[r.id].cond);
      const p = priceOf(sel[r.id].price);
      if (platform === "tradera") {
        return {
          key: String(r.id),
          title: `${r.name} ${tag(r)} ${r.set} ${c.id}`.slice(0, 80),
          meta: p !== null ? `Förslag på pris: ${p} kr` : undefined,
          body: `${r.name}${r.team ? " (" + r.team + ")" : ""}\n${r.set}, kort ${tag(r)}.\nSkick: ${c.sv}.${extra.trim() ? "\n" + extra.trim() : ""}`,
        };
      }
      return {
        key: String(r.id),
        title: `${r.name} ${r.set} ${tag(r)} ${c.en}`.slice(0, 80),
        meta: p !== null ? `Price idea: ${p} SEK (convert to your listing currency)` : undefined,
        body: `${r.name}${r.team ? ", " + r.team : ""}\n${r.set} - card ${tag(r)}.\nCondition: ${c.en}.\nCombined shipping available. Photos show the actual card.`,
      };
    });
  }, [items, sel, platform, extra]);

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 1800);
    } catch {
      setErr(t("Kunde inte kopiera. Markera texten och kopiera själv."));
    }
  };

  const n = items.length;
  return (
    <div className="t-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="panel tradera sell" role="dialog" aria-modal="true" aria-label={t("Sälj kort")}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3>{t("Sälj kort")}</h3>
          <button className="btn small ghost" type="button" onClick={onClose}>{t("Stäng")}</button>
        </div>
        <div className="note">{t("Markera korten du vill sälja, välj skick och pris och kopiera säljposten. Inget här sparas. Gäller baskort, inte paralleller.")}</div>
        {err && <div className="note warn">{err}</div>}

        <div className="row">
          <input className="grow t-input" placeholder={t("Sök bland dina kort")} aria-label={t("Sök bland dina kort")} value={find} onChange={(e) => setFind(e.target.value)} />
          <div className="seg" role="group" aria-label={t("Vilka kort")}>
            <button type="button" aria-pressed={!showAll} onClick={() => setShowAll(false)}>{t("Dubbletter")}</button>
            <button type="button" aria-pressed={showAll} onClick={() => setShowAll(true)}>{t("Alla mina")}</button>
          </div>
        </div>

        {rows === null && <div className="note">{t("Läser dina kort …")}</div>}
        {rows && !rows.length && !err && <div className="note">{showAll ? t("Du har inte prickat av några kort än.") : t("Du har inga dubbletter. Välj Alla mina för att sälja andra kort.")}</div>}
        {rows && rows.length > 0 && !shown.length && <div className="note">{t("Inga kort matchar sökningen.")}</div>}

        <div className="sell-list">
          {shown.slice(0, 300).map((r) => {
            const p = sel[r.id];
            return (
              <div key={r.id} className={`sell-row${p ? " on" : ""}`}>
                <button type="button" className="pl-card" aria-pressed={!!p} onClick={() => toggle(r)}>
                  <span className="pl-box">{p ? "✓" : ""}</span>
                  <span className="mono">{tag(r)}</span>
                  <b>{r.name}</b>
                  <span className="grow">{r.set}</span>
                  {r.qty > 1 && <span className="tag dup">×{r.qty}</span>}
                </button>
                {p && (
                  <div className="sell-edit">
                    <select value={p.cond} onChange={(e) => patch(r.id, { cond: e.target.value })} aria-label={t("Skick")}>
                      {CONDS.map((c) => <option key={c.id} value={c.id}>{t(c.sv)}</option>)}
                    </select>
                    <input className="t-input" inputMode="numeric" placeholder={t("Pris, kr")} aria-label={t("Pris, kr")} value={p.price} onChange={(e) => patch(r.id, { price: e.target.value })} />
                    <button className="btn small" type="button" disabled={busyId === r.id} onClick={() => suggest(r)}>{busyId === r.id ? t("Söker …") : t("Föreslå pris")}</button>
                    {hint[r.id] && <span className="note">{hint[r.id]}</span>}
                  </div>
                )}
              </div>
            );
          })}
          {shown.length > 300 && <div className="note">{t("Visar de första 300. Sök för att hitta fler.")}</div>}
        </div>

        {n > 0 && (
          <div className="sell-out">
            <div className="label">{n} {t("kort valda")}</div>
            <div className="row">
              <div className="seg" role="group" aria-label={t("Plattform")}>
                {([["facebook", "Facebook"], ["tradera", "Tradera"], ["ebay", "eBay"], ["text", t("Text")]] as [Platform, string][]).map(([k, l]) => (
                  <button key={k} type="button" aria-pressed={platform === k} onClick={() => setPlatform(k)}>{l}</button>
                ))}
              </div>
            </div>
            {platform !== "ebay" && (
              <input className="t-input" style={{ width: "100%" }} value={extra} onChange={(e) => setExtra(e.target.value)} maxLength={200} aria-label={t("Frakt och hämtning")} placeholder={t("Frakt och hämtning")} />
            )}
            {blocks.map((b) => (
              <div key={b.key} className="sell-block">
                {b.title && (
                  <div className="row">
                    <input className="grow t-input" readOnly value={b.title} onFocus={(e) => e.target.select()} aria-label={t("Rubrik")} />
                    <button className="btn small" type="button" onClick={() => copy(b.key + "t", b.title || "")}>{copied === b.key + "t" ? t("Kopierad") : t("Kopiera rubrik")}</button>
                  </div>
                )}
                {b.meta && <div className="note">{b.meta}</div>}
                <textarea readOnly value={b.body} onFocus={(e) => e.target.select()} rows={Math.min(14, b.body.split("\n").length + 1)} aria-label={t("Säljtext")} />
                <div className="actions">
                  <button className="btn primary small" type="button" onClick={() => copy(b.key, b.body)}>{copied === b.key ? t("Kopierad") : t("Kopiera text")}</button>
                </div>
              </div>
            ))}
            <div className="note">
              <b>{t("Bilder att ladda upp:")}</b> {items.map((r) => `${tag(r)} ${r.name}`).join(" · ")}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
