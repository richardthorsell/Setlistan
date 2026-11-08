"use client";

import { useEffect, useState } from "react";
import { type Parallel, parallelLabel } from "@/lib/checklist";
import "./panels.css";
import { useT } from "@/lib/i18n";

export type Wish = { priority: number; max_price: number | null; note: string | null };

// Copies for sale, what the card cost, what it is listed for, and whether a bought card is still on its way.
export type Trade = { for_sale: number; buy_price: number | null; sell_price: number | null; incoming: boolean; note: string | null };

function Stepper({ value, min, max = 999, onChange, label }: { value: number; min: number; max?: number; onChange: (n: number) => void; label: string }) {
  return (
    <span className="stepper" role="group" aria-label={label}>
      <button type="button" className="btn small" aria-label="−" disabled={value <= min} onClick={() => onChange(value - 1)}>−</button>
      <b className="mono">{value}</b>
      <button type="button" className="btn small" aria-label="+" disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
    </span>
  );
}

const toNum = (s: string) => {
  if (s.trim() === "") return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : undefined;
};

// Everything about one card: how many copies, which parallels (with serial numbers and copies), and the wishlist.
export default function CardPar({
  cardId,
  title,
  options,
  owned,
  qty,
  baseQty,
  wish,
  trade,
  onBaseQty,
  onQty,
  onWish,
  onTrade,
  onSellOne,
  onArrived,
  onToggle,
  onSerial,
  onClose,
}: {
  cardId: number;
  title: string;
  options: Parallel[];
  owned: Map<string, string | null>;
  qty: Map<string, number>;
  baseQty: number;
  wish: Wish | null;
  trade: Trade | null;
  onBaseQty: (n: number) => void;
  onQty: (parallelId: number, n: number) => void;
  onWish: (w: Wish | null) => void;
  onTrade: (patch: Partial<Trade>) => void;
  onSellOne: () => void;
  onArrived: () => void;
  onToggle: (parallelId: number, on: boolean) => void;
  onSerial: (parallelId: number, value: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [price, setPrice] = useState(wish?.max_price != null ? String(wish.max_price) : "");
  const [buy, setBuy] = useState(trade?.buy_price != null ? String(trade.buy_price) : "");
  const [sell, setSell] = useState(trade?.sell_price != null ? String(trade.sell_price) : "");
  const forSale = Math.min(trade?.for_sale ?? 0, baseQty);
  const savePrices = () => {
    const b = toNum(buy);
    const s = toNum(sell);
    if (b !== undefined && b !== (trade?.buy_price ?? null)) onTrade({ buy_price: b });
    if (s !== undefined && s !== (trade?.sell_price ?? null)) onTrade({ sell_price: s });
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const have = options.filter((p) => owned.has(`${cardId}:${p.id}`)).length;
  const savePrice = () => {
    if (!wish) return;
    const n = price.trim() === "" ? null : Math.max(0, Number(price.replace(",", ".")));
    if (n !== null && !Number.isFinite(n)) return;
    if (n !== wish.max_price) onWish({ ...wish, max_price: n });
  };

  return (
    <div className="t-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="panel tradera" role="dialog" aria-modal="true" aria-label={t("Kortet")}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3>{t("Kortet")}</h3>
          <button className="btn small ghost" type="button" onClick={onClose}>{t("Klar")}</button>
        </div>
        <div className="t-context">
          <b>{title}</b>
          {options.length > 0 && <span>{have ? `${have} ${t("av")} ${options.length} ${t("markerade")}` : `${options.length} ${t("finns")}`}</span>}
        </div>

        <div className="par-row">
          <span className="grow">{t("Grundkort")}<span className="note"> · {baseQty > 1 ? `${baseQty - 1} ${t("dubblett(er)")}` : baseQty === 1 ? t("Du har det") : t("Du har det inte")}</span></span>
          <Stepper value={baseQty} min={0} onChange={onBaseQty} label={t("Antal")} />
        </div>

        {options.length > 0 && (
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
                    <>
                      <input
                        key={owned.get(key) ?? ""}
                        className="serial"
                        defaultValue={owned.get(key) ?? ""}
                        placeholder={p.print_run ? `nr/${p.print_run}` : "nr"}
                        maxLength={20}
                        aria-label={`${t("Serienummer för")} ${parallelLabel(p)}`}
                        onBlur={(e) => onSerial(p.id, e.target.value)}
                      />
                      <Stepper value={qty.get(key) ?? 1} min={1} onChange={(n) => onQty(p.id, n)} label={t("Antal")} />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="wish-box trade-box">
          <div className="label">{t("Till salu och värde")}</div>
          {baseQty > 0 && (
            <div className="par-row">
              <span className="grow">{t("Till salu")}<span className="note"> · {forSale > 0 ? `${forSale} ${t("av")} ${baseQty}` : t("Inte till salu")}</span></span>
              <Stepper value={forSale} min={0} max={baseQty} onChange={(n) => onTrade({ for_sale: n })} label={t("Antal till salu")} />
              {forSale > 0 && <button className="btn small" type="button" onClick={onSellOne}>{t("Sålt ett")}</button>}
            </div>
          )}
          <div className="row">
            <input className="t-input" inputMode="decimal" style={{ width: 140 }} placeholder={t("Inköpspris kr")} aria-label={t("Inköpspris i kronor")} value={buy} onChange={(e) => setBuy(e.target.value)} onBlur={savePrices} />
            <input className="t-input" inputMode="decimal" style={{ width: 140 }} placeholder={t("Pris till salu kr")} aria-label={t("Pris till salu i kronor")} value={sell} onChange={(e) => setSell(e.target.value)} onBlur={savePrices} />
          </div>
          <label className="check">
            <input type="checkbox" checked={!!trade?.incoming} onChange={(e) => onTrade({ incoming: e.target.checked })} />
            <span><b>{t("På väg")}</b> {t("Jag har köpt kortet och väntar på det")}</span>
          </label>
          {trade?.incoming && (
            <div className="row">
              <input
                className="grow t-input"
                key={trade.note ?? ""}
                placeholder={t("Säljare, var och när du köpte det")}
                aria-label={t("Anteckning om köpet")}
                maxLength={200}
                defaultValue={trade.note ?? ""}
                onBlur={(e) => e.target.value.trim() !== (trade.note ?? "") && onTrade({ note: e.target.value.trim() || null })}
              />
              {baseQty === 0 && <button className="btn small primary" type="button" onClick={onArrived}>{t("Kortet har kommit")}</button>}
            </div>
          )}
        </div>

        <div className="wish-box">
          <label className="check">
            <input type="checkbox" checked={!!wish} onChange={(e) => onWish(e.target.checked ? { priority: 2, max_price: null, note: null } : null)} />
            <span><b>{t("Önskelista")}</b> {t("Jag jagar det här kortet")}</span>
          </label>
          {wish && (
            <div className="row">
              <div className="seg" role="group" aria-label={t("Prioritet")}>
                {([1, 2, 3] as const).map((n) => (
                  <button key={n} type="button" aria-pressed={wish.priority === n} onClick={() => onWish({ ...wish, priority: n })}>{[t("Hög"), t("Normal"), t("Låg")][n - 1]}</button>
                ))}
              </div>
              <input className="t-input" inputMode="decimal" style={{ width: 120 }} placeholder={t("Maxpris kr")} aria-label={t("Maxpris i kronor")} value={price} onChange={(e) => setPrice(e.target.value)} onBlur={savePrice} />
              <input
                className="grow t-input"
                key={wish.note ?? ""}
                placeholder={t("Anteckning, till exempel /30")}
                aria-label={t("Anteckning")}
                maxLength={200}
                defaultValue={wish.note ?? ""}
                onBlur={(e) => e.target.value.trim() !== (wish.note ?? "") && onWish({ ...wish, note: e.target.value.trim() || null })}
              />
            </div>
          )}
        </div>
        <div className="note">{t("Markera de paralleller du har av kortet. Serienumret är valfritt.")}</div>
      </section>
    </div>
  );
}
