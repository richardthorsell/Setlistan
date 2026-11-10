"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import "./panels.css";
import { useT } from "@/lib/i18n";

type Row = {
  card_id: number;
  set_id: string;
  priority: number;
  max_price: number | null;
  note: string | null;
  cards: { no: number; name: string; team: string; sections: { code: string; name: string } | null } | null;
  sets: { name: string } | null;
};

// Cards you are chasing across all sets, most important first.
export default function WishPanel({ supabase, onClose, onChanged }: { supabase: SupabaseClient; onClose: () => void; onChanged: (count: number) => void }) {
  const t = useT();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<{ card_id: number; note: string | null; cards: Row["cards"]; sets: Row["sets"] }[]>([]);

  const load = async () => {
    const { data, error } = await supabase
      .from("wishlist")
      .select("card_id, set_id, priority, max_price, note, cards(no, name, team, sections(code, name)), sets(name)")
      .order("priority")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) return setErr(t("Kunde inte läsa önskelistan."));
    const list = (data as unknown as Row[]) || [];
    setRows(list);
    onChanged(list.length);
  };

  // Load once when the panel opens (t and onChanged change on every render, so they must not be dependencies).
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    supabase
      .from("card_trade")
      .select("card_id, note, cards(no, name, team, sections(code, name)), sets(name)")
      .eq("incoming", true)
      .limit(200)
      .then(({ data }) => setIncoming((data as unknown as typeof incoming) || []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const patch = async (r: Row, change: Partial<Pick<Row, "priority" | "max_price">>) => {
    setRows((p) => (p || []).map((x) => (x.card_id === r.card_id ? { ...x, ...change } : x)).sort((a, b) => a.priority - b.priority));
    const { error } = await supabase.from("wishlist").update(change).eq("card_id", r.card_id);
    if (error) {
      setErr(t("Kunde inte spara önskelistan."));
      load();
    }
  };
  const remove = async (r: Row) => {
    const next = (rows || []).filter((x) => x.card_id !== r.card_id);
    setRows(next);
    onChanged(next.length);
    const { error } = await supabase.from("wishlist").delete().eq("card_id", r.card_id);
    if (error) {
      setErr(t("Kunde inte spara önskelistan."));
      load();
    }
  };

  const q = (r: Row) => [r.cards?.name, r.sets?.name].filter(Boolean).join(" ");
  const PRIO = [t("Hög"), t("Normal"), t("Låg")];

  return (
    <div className="t-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="panel tradera wish" role="dialog" aria-modal="true" aria-label={t("Önskelista")}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3>{t("Önskelista")}</h3>
          <button className="btn small ghost" type="button" onClick={onClose}>{t("Stäng")}</button>
        </div>
        <div className="note">{t("Kort du jagar. Lägg till från ett kort via knappen Mer. Länkarna söker på Tradera och eBay.")}</div>
        {err && <div className="note warn">{err}</div>}
        {rows === null && !err && <div className="note">{t("Läser …")}</div>}
        {rows && !rows.length && <div className="note">{t("Inga kort på önskelistan än.")}</div>}
        <div className="wish-list">
          {(rows || []).map((r) => (
            <div key={r.card_id} className="wish-item">
              <div className="grow">
                <b>{r.cards ? `${r.cards.sections?.code ? r.cards.sections.code + " " : ""}${r.cards.no} · ${r.cards.name}` : ""}</b>
                <div className="note">{[r.sets?.name, r.cards?.team, r.note].filter(Boolean).join(" · ")}</div>
              </div>
              <div className="seg" role="group" aria-label={t("Prioritet")}>
                {[1, 2, 3].map((n) => (
                  <button key={n} type="button" aria-pressed={r.priority === n} onClick={() => patch(r, { priority: n })}>{PRIO[n - 1]}</button>
                ))}
              </div>
              <input
                className="t-input"
                style={{ width: 96 }}
                inputMode="decimal"
                placeholder={t("Maxpris kr")}
                aria-label={t("Maxpris i kronor")}
                defaultValue={r.max_price ?? ""}
                key={r.max_price ?? "x"}
                onBlur={(e) => {
                  const v = e.target.value.trim() === "" ? null : Number(e.target.value.replace(",", "."));
                  if (v === null || (Number.isFinite(v) && v >= 0)) v !== r.max_price && patch(r, { max_price: v });
                }}
              />
              <a className="btn small" href={"https://www.tradera.com/search?q=" + encodeURIComponent(q(r))} target="_blank" rel="noopener noreferrer">Tradera</a>
              <a className="btn small" href={"https://www.ebay.com/sch/i.html?_nkw=" + encodeURIComponent(q(r)) + "&LH_Auction=1&_sop=1"} target="_blank" rel="noopener noreferrer">eBay</a>
              <button className="btn small ghost" type="button" aria-label={t("Ta bort från önskelistan")} onClick={() => remove(r)}>✕</button>
            </div>
          ))}
        </div>
        {incoming.length > 0 && (
          <>
            <div className="label" style={{ marginTop: 10 }}>{t("På väg")} ({incoming.length})</div>
            <div className="wish-list">
              {incoming.map((r) => (
                <div key={r.card_id} className="wish-item">
                  <div className="grow">
                    <b>{r.cards ? `${r.cards.sections?.code ? r.cards.sections.code + " " : ""}${r.cards.no} · ${r.cards.name}` : ""}</b>
                    <div className="note">{[r.sets?.name, r.cards?.team, r.note].filter(Boolean).join(" · ")}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
