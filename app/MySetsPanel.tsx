"use client";

import { useEffect, useMemo, useState } from "react";
import "./panels.css";
import { useT } from "@/lib/i18n";
import type { SetStat } from "@/lib/checklist";

const nameOf = (s: SetStat) => s.short_name || s.name;

// Every set where you own at least one card, with how far you have come. A click opens the set.
export default function MySetsPanel({ sets, counts, onOpen, onClose }: { sets: SetStat[]; counts: Record<string, number>; onOpen: (id: string) => void; onClose: () => void }) {
  const t = useT();
  const [sort, setSort] = useState<"pct" | "name">("pct");
  const [q, setQ] = useState("");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const mine = useMemo(() => sets.filter((s) => (counts[s.id] || 0) > 0), [sets, counts]);
  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return mine
      .filter((s) => !ql || nameOf(s).toLowerCase().includes(ql) || s.name.toLowerCase().includes(ql))
      .map((s) => ({ s, have: counts[s.id] || 0, pct: s.card_count ? Math.round(((counts[s.id] || 0) / s.card_count) * 100) : 0 }))
      .sort((a, b) => (sort === "name" ? nameOf(a.s).localeCompare(nameOf(b.s), "sv") : b.pct - a.pct || nameOf(a.s).localeCompare(nameOf(b.s), "sv")));
  }, [mine, counts, q, sort]);

  return (
    <div className="t-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="panel tradera" role="dialog" aria-modal="true" aria-label={t("Mina set")}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3>{t("Mina set")} ({mine.length})</h3>
          <button className="btn small ghost" type="button" onClick={onClose}>{t("Stäng")}</button>
        </div>
        {!mine.length && <div className="note">{t("Inga påbörjade än")}</div>}
        {mine.length > 0 && (
          <div className="row" style={{ flexWrap: "wrap" }}>
            <input className="t-input grow" type="search" placeholder={t("Sök bland dina set")} aria-label={t("Sök bland dina set")} value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="seg" role="group" aria-label={t("Sortera")}>
              <button type="button" aria-pressed={sort === "pct"} onClick={() => setSort("pct")}>{t("Mest klara")}</button>
              <button type="button" aria-pressed={sort === "name"} onClick={() => setSort("name")}>{t("Namn")}</button>
            </div>
          </div>
        )}
        <div className="pl-list start-scroll">
          {rows.map(({ s, have, pct }) => (
            <button key={s.id} type="button" className="pl-row" onClick={() => onOpen(s.id)}>
              <b>{nameOf(s)}</b>
              <span className="bar"><i style={{ width: `${pct}%` }} /></span>
              <span className="note mono">{have} / {s.card_count} · {pct} %</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
