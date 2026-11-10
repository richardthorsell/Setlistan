"use client";

import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import "./panels.css";
import { useT } from "@/lib/i18n";
import type { SetStat } from "@/lib/checklist";

type Ov = { sets_started: number; cards_owned: number; dup_cards: number; for_sale_cards: number; for_sale_value: number | string; wish_count: number; wish_high: number; incoming_count: number };

const nameOf = (s: SetStat) => s.short_name || s.name;
const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

// The start page overview: a few numbers about your collection, each leading on to the view where you act on it.
export default function Overview({
  supabase,
  sets,
  counts,
  favs,
  followedCount,
  refreshKey,
  onOpenSet,
  onMissing,
  onSell,
  onWish,
}: {
  supabase: SupabaseClient;
  sets: SetStat[];
  counts: Record<string, number>;
  favs: Set<string>;
  followedCount: number;
  refreshKey: string;
  onOpenSet: (id: string) => void;
  onMissing: () => void;
  onSell: () => void;
  onWish: () => void;
}) {
  const t = useT();
  const [ov, setOv] = useState<Ov | null>(null);

  useEffect(() => {
    let live = true;
    supabase.rpc("my_overview").then(({ data }) => {
      const row = (Array.isArray(data) ? data[0] : data) as Ov | undefined;
      if (live && row) setOv(row);
    });
    return () => {
      live = false;
    };
  }, [supabase, refreshKey]);

  const { started, closest, missingTotal, missingSets } = useMemo(() => {
    const started = sets.filter((s) => (counts[s.id] || 0) > 0);
    const closest = started
      .filter((s) => s.card_count > 0 && (counts[s.id] || 0) < s.card_count)
      .sort((a, b) => (counts[b.id] || 0) / b.card_count - (counts[a.id] || 0) / a.card_count)[0];
    const mine = sets.filter((s) => favs.has(s.id) || (counts[s.id] || 0) > 0);
    const missingTotal = mine.reduce((n, s) => n + Math.max(0, s.card_count - (counts[s.id] || 0)), 0);
    return { started, closest, missingTotal, missingSets: mine.filter((s) => s.card_count > (counts[s.id] || 0)).length };
  }, [sets, counts, favs]);

  if (!ov) return null;
  if (ov.cards_owned === 0 && favs.size === 0 && followedCount === 0 && ov.wish_count === 0) {
    return (
      <div className="ov-start">
        <b>{t("Kom igång")}</b>
        <span>{t("Sök ett set eller en spelare ovan och pricka av dina första kort. Här samlas sedan det du har, saknar och säljer.")}</span>
      </div>
    );
  }

  const value = Math.round(Number(ov.for_sale_value) || 0);
  const pct = closest ? Math.round(((counts[closest.id] || 0) / closest.card_count) * 100) : 0;
  const wishSub = [ov.wish_high > 0 ? `${ov.wish_high} ${t("Hög").toLowerCase()}` : "", ov.incoming_count > 0 ? `${ov.incoming_count} ${t("På väg").toLowerCase()}` : ""].filter(Boolean).join(" · ");
  const saleSub = [value > 0 ? `${value} kr` : "", ov.dup_cards > 0 ? `${ov.dup_cards} ${t("Dubbletter").toLowerCase()}` : ""].filter(Boolean).join(" · ");

  return (
    <div className="ov-grid" role="group" aria-label={t("Översikt")}>
      <button type="button" className="ov-tile" onClick={() => (closest ? onOpenSet(closest.id) : jump("fav-sets"))}>
        <span className="label">{t("Mina set")}</span>
        <span className="ov-num">{started.length}</span>
        <span className="ov-sub">{closest ? `${t("Närmast klart")}: ${nameOf(closest)} · ${pct} %` : t("Inga påbörjade än")}</span>
      </button>
      <button type="button" className="ov-tile" onClick={onMissing}>
        <span className="label">{t("Saknas")}</span>
        <span className="ov-num">{missingTotal}</span>
        <span className="ov-sub">{missingSets > 0 ? `${t("i")} ${missingSets} ${t("set")}` : t("Favorisera ett set för att se vad som saknas")}</span>
      </button>
      <button type="button" className="ov-tile" onClick={onSell}>
        <span className="label">{t("Till salu")}</span>
        <span className="ov-num">{ov.for_sale_cards}</span>
        <span className="ov-sub">{saleSub || t("Inget till salu än")}</span>
      </button>
      <button type="button" className="ov-tile" onClick={onWish}>
        <span className="label">{t("Önskelista")}</span>
        <span className="ov-num">{ov.wish_count}</span>
        <span className="ov-sub">{wishSub || t("Inget på önskelistan än")}</span>
      </button>
      <button type="button" className="ov-tile" onClick={() => jump("followed")}>
        <span className="label">{t("Spelare du följer")}</span>
        <span className="ov-num">{followedCount}</span>
        <span className="ov-sub">{followedCount > 0 ? t("Visas här under") : t("Följ en spelare från en sökning")}</span>
      </button>
    </div>
  );
}
