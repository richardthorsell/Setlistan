"use client";

import { useEffect, useMemo } from "react";
import "./panels.css";
import { useT } from "@/lib/i18n";
import type { SetStat } from "@/lib/checklist";

const nameOf = (s: SetStat) => s.short_name || s.name;

// What is missing in the sets you have started or starred, closest to complete first. A click opens the set on its missing cards.
export default function MissingPanel({ sets, counts, favs, onOpen, onClose }: { sets: SetStat[]; counts: Record<string, number>; favs: Set<string>; onOpen: (id: string) => void; onClose: () => void }) {
  const t = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rows = useMemo(
    () =>
      sets
        .filter((s) => (favs.has(s.id) || (counts[s.id] || 0) > 0) && s.card_count > (counts[s.id] || 0))
        .map((s) => ({ s, have: counts[s.id] || 0, missing: s.card_count - (counts[s.id] || 0) }))
        .sort((a, b) => b.have / b.s.card_count - a.have / a.s.card_count || a.missing - b.missing),
    [sets, counts, favs],
  );

  return (
    <div className="t-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="panel tradera" role="dialog" aria-modal="true" aria-label={t("Saknas")}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3>{t("Saknas i dina set")}</h3>
          <button className="btn small ghost" type="button" onClick={onClose}>{t("Stäng")}</button>
        </div>
        {!rows.length && <div className="note">{t("Inga saknade kort här. Snyggt!")}</div>}
        <div className="pl-list">
          {rows.map(({ s, have, missing }) => (
            <button key={s.id} type="button" className="pl-row" onClick={() => onOpen(s.id)}>
              <b>{nameOf(s)}</b>
              <span className="bar"><i style={{ width: `${Math.round((have / s.card_count) * 100)}%` }} /></span>
              <span className="note mono">{missing} {t("saknas")} {t("av")} {s.card_count}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
