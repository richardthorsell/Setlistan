"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Parallel } from "@/lib/checklist";
import CardPar, { type Trade, type Wish } from "./CardPar";
import { useT } from "@/lib/i18n";

const NO_TRADE: Trade = { for_sale: 0, buy_price: null, sell_price: null, incoming: false, note: null };

export type ParCardRef = { card_id: number; set_id: string; set_name: string; section_code: string; no: number; name: string; qty: number | null };

// The same card dialog as in the checklist (copies, parallels, serial numbers, for sale, wishlist), opened from the player view.
export default function PlayerCardPar({
  supabase,
  card,
  onBaseQty,
  onParCount,
  onClose,
}: {
  supabase: SupabaseClient;
  card: ParCardRef;
  onBaseQty: (n: number) => void;
  onParCount: (n: number) => void;
  onClose: () => void;
}) {
  const t = useT();
  const id = card.card_id;
  const [options, setOptions] = useState<Parallel[] | null>(null);
  const [owned, setOwned] = useState<Map<string, string | null>>(new Map());
  const [qty, setQty] = useState<Map<string, number>>(new Map());
  const [baseQty, setBase] = useState(card.qty ?? 0);
  const [wish, setWishState] = useState<Wish | null>(null);
  const [trade, setTradeState] = useState<Trade | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const c = await supabase.from("cards").select("section_id").eq("id", id).maybeSingle();
      const sid = (c.data as { section_id: number | null } | null)?.section_id ?? null;
      const [p, op, w, tr, ob] = await Promise.all([
        supabase.from("parallels").select("id, section_id, name, print_run, position").eq("set_id", card.set_id).order("position"),
        supabase.from("owned_parallels").select("parallel_id, serial, qty").eq("card_id", id),
        supabase.from("wishlist").select("priority, max_price, note").eq("card_id", id).maybeSingle(),
        supabase.from("card_trade").select("for_sale, buy_price, sell_price, incoming, note").eq("card_id", id).maybeSingle(),
        supabase.from("owned").select("qty").eq("card_id", id).maybeSingle(),
      ]);
      if (!live) return;
      if (p.error || op.error) return setErr(t("Kunde inte läsa kortet."));
      setOptions(((p.data as Parallel[]) || []).filter((x) => x.section_id === null || x.section_id === sid));
      const o = new Map<string, string | null>();
      const q = new Map<string, number>();
      for (const r of (op.data as { parallel_id: number; serial: string | null; qty: number | null }[]) || []) {
        o.set(`${id}:${r.parallel_id}`, r.serial);
        if ((r.qty ?? 1) > 1) q.set(`${id}:${r.parallel_id}`, r.qty as number);
      }
      setOwned(o);
      setQty(q);
      setWishState((w.data as Wish | null) ?? null);
      setTradeState((tr.data as Trade | null) ?? null);
      const ownedRow = ob.data as { qty: number | null } | null;
      setBase(ownedRow ? ownedRow.qty ?? 1 : 0);
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fail = () => setErr(t("Kunde inte spara. Ladda om sidan och försök igen."));

  const setTrade = async (patch: Partial<Trade>) => {
    const prev = trade;
    const next: Trade = { ...(prev ?? NO_TRADE), ...patch };
    const empty = next.for_sale === 0 && next.buy_price === null && next.sell_price === null && !next.incoming && !next.note;
    setTradeState(empty ? null : next);
    const r = empty
      ? await supabase.from("card_trade").delete().eq("card_id", id)
      : await supabase.from("card_trade").upsert({ card_id: id, set_id: card.set_id, ...next, updated_at: new Date().toISOString() }, { onConflict: "user_id,card_id" });
    if (r.error) {
      setTradeState(prev);
      fail();
    }
  };

  const setBaseQty = async (n: number) => {
    if ((trade?.for_sale ?? 0) > Math.max(n, 0)) setTrade({ for_sale: Math.max(n, 0) });
    setBase(Math.max(n, 0));
    onBaseQty(Math.max(n, 0));
    const r = n <= 0 ? await supabase.from("owned").delete().eq("card_id", id) : await supabase.from("owned").upsert({ card_id: id, set_id: card.set_id, qty: n }, { onConflict: "user_id,card_id" });
    if (r.error) fail();
  };

  const toggle = async (pid: number, on: boolean) => {
    const key = `${id}:${pid}`;
    const next = new Map(owned);
    if (on) next.set(key, next.get(key) ?? null);
    else next.delete(key);
    setOwned(next);
    onParCount(next.size);
    const { error } = on
      ? await supabase.from("owned_parallels").upsert({ card_id: id, parallel_id: pid, set_id: card.set_id }, { onConflict: "user_id,card_id,parallel_id", ignoreDuplicates: true })
      : await supabase.from("owned_parallels").delete().eq("parallel_id", pid).eq("card_id", id);
    if (error) fail();
  };

  const saveSerial = async (pid: number, value: string) => {
    const key = `${id}:${pid}`;
    const serial = value.trim() || null;
    if (!owned.has(key) || owned.get(key) === serial) return;
    const next = new Map(owned);
    next.set(key, serial);
    setOwned(next);
    const { error } = await supabase.from("owned_parallels").update({ serial }).eq("card_id", id).eq("parallel_id", pid);
    if (error) setErr(t("Kunde inte spara serienumret."));
  };

  const setParQty = async (pid: number, n: number) => {
    if (n < 1) return;
    const key = `${id}:${pid}`;
    const next = new Map(qty);
    if (n > 1) next.set(key, n);
    else next.delete(key);
    setQty(next);
    const { error } = await supabase.from("owned_parallels").update({ qty: n }).eq("card_id", id).eq("parallel_id", pid);
    if (error) fail();
  };

  const setWish = async (w: Wish | null) => {
    const prev = wish;
    setWishState(w);
    const r = w
      ? await supabase.from("wishlist").upsert({ card_id: id, set_id: card.set_id, priority: w.priority, max_price: w.max_price, note: w.note }, { onConflict: "user_id,card_id" })
      : await supabase.from("wishlist").delete().eq("card_id", id);
    if (r.error) {
      setWishState(prev);
      setErr(t("Kunde inte spara önskelistan."));
    }
  };

  const sellOne = async () => {
    if (baseQty < 1) return;
    const ft = Math.min(trade?.for_sale ?? 0, baseQty);
    await setBaseQty(baseQty - 1);
    if (ft > 0 && baseQty - 1 >= ft) setTrade({ for_sale: ft - 1 });
  };

  if (!options) {
    return (
      <div className="t-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <section className="panel tradera" role="dialog" aria-modal="true" aria-label={t("Kortet")}>
          <div className="note">{err || t("Läser …")}</div>
          <button className="btn small ghost" type="button" onClick={onClose}>{t("Klar")}</button>
        </section>
      </div>
    );
  }

  return (
    <>
      <CardPar
        cardId={id}
        title={`${card.set_name} · ${card.section_code ? card.section_code + " " : ""}${card.no} · ${card.name}`}
        options={options}
        owned={owned}
        qty={qty}
        baseQty={baseQty}
        wish={wish}
        trade={trade}
        onTrade={(p) => setTrade(p.incoming === false ? { ...p, note: null } : p)}
        onSellOne={sellOne}
        onArrived={async () => {
          await setBaseQty(1);
          setTrade({ incoming: false, note: null });
        }}
        onBaseQty={setBaseQty}
        onQty={setParQty}
        onWish={setWish}
        onToggle={toggle}
        onSerial={saveSerial}
        onClose={onClose}
      />
      {err && <div className="note warn" style={{ position: "fixed", bottom: 12, left: 12, right: 12, zIndex: 80 }}>{err}</div>}
    </>
  );
}
