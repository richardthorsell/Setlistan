"use client";

import { useEffect } from "react";
import { type Parallel, parallelLabel } from "@/lib/checklist";
import "./panels.css";
import { useT } from "@/lib/i18n";

// Pick which parallels of one card you own, with an optional serial number for each.
export default function CardPar({
  cardId,
  title,
  options,
  owned,
  onToggle,
  onSerial,
  onClose,
}: {
  cardId: number;
  title: string;
  options: Parallel[];
  owned: Map<string, string | null>;
  onToggle: (parallelId: number, on: boolean) => void;
  onSerial: (parallelId: number, value: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const have = options.filter((p) => owned.has(`${cardId}:${p.id}`)).length;

  return (
    <div className="t-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="panel tradera" role="dialog" aria-modal="true" aria-label={t("Paralleller")}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3>{t("Paralleller")}</h3>
          <button className="btn small ghost" type="button" onClick={onClose}>{t("Klar")}</button>
        </div>
        <div className="t-context">
          <b>{title}</b>
          <span>{have ? `${have} ${t("av")} ${options.length} ${t("markerade")}` : `${options.length} ${t("finns")}`}</span>
        </div>
        <div className="par-list">
          {options.map((p) => {
            const key = `${cardId}:${p.id}`;
            const on = owned.has(key);
            return (
              <div key={p.id} className="par-row">
                <label className="check">
                  <input type="checkbox" checked={on} onChange={(e) => onToggle(p.id, e.target.checked)} />
                  <span>{parallelLabel(p)}</span>
                </label>
                {on && (
                  <input
                    key={owned.get(key) ?? ""}
                    className="serial"
                    defaultValue={owned.get(key) ?? ""}
                    placeholder={p.print_run ? `nr/${p.print_run}` : "nr"}
                    maxLength={20}
                    aria-label={`Serienummer för ${parallelLabel(p)}`}
                    onBlur={(e) => onSerial(p.id, e.target.value)}
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="note">{t("Markera de paralleller du har av kortet. Serienumret är valfritt.")}</div>
      </section>
    </div>
  );
}
