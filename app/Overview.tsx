"use client";

import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import "./panels.css";
import { useT } from "@/lib/i18n";
import type { SetStat } from "@/lib/checklist";

type Ov = { sets_started: number; cards_owned: number; dup_cards: number; for_sale_cards: number; for_sale_value: number | string; wish_count: number; wish_high: number; incoming_count: number };

const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

// The start page overview: a few numbers about your collection, each leading on to the view where you act on it.
export default function Overview({
  supabase,
  sets,
  counts,
  favs,
  followed,
  refreshKey,
  onMySets,
  onSell,
  onWish,
}: {
  supabase: SupabaseClient;
  sets: SetStat[];
  counts: Record<string, number>;
  favs: Set<string>;
  followed: { have?: number; total?: number }[];
  refreshKey: string;
  onMySets: () => void;
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

  // How much of the cards in the sets you have started you own.
  const setStats = useMemo(() => {
    const started = sets.filter((s) => (counts[s.id] || 0) > 0);
    const have = started.reduce((n, s) => n + (counts[s.id] || 0), 0);
    const total = started.reduce((n, s) => n + s.card_count, 0);
    return { n: started.length, pct: total ? Math.round((have / total) * 100) : 0 };
  }, [sets, counts]);
  const playerPct = useMemo(() => {
    const total = followed.reduce((n, f) => n + (f.total || 0), 0);
    const have = followed.reduce((n, f) => n + (f.have || 0), 0);
    return total ? Math.round((have / total) * 100) : 0;
  }, [followed]);

  if (!ov) return null;
  if (ov.cards_owned === 0 && favs.size === 0 && followed.length === 0 && ov.wish_count === 0) {
    return (
      <div className="ov-start">
        <b>{t("Kom igång")}</b>
        <span>{t("Sök ett set eller en spelare ovan och pricka av dina första kort. Här samlas sedan det du har, saknar och säljer.")}</span>
      </div>
    );
  }

  const value = Math.round(Number(ov.for_sale_value) || 0);
  const wishSub = [ov.wish_high > 0 ? `${ov.wish_high} ${t("Hög").toLowerCase()}` : "", ov.incoming_count > 0 ? `${ov.incoming_count} ${t("På väg").toLowerCase()}` : ""].filter(Boolean).join(" · ");
  const saleSub = [value > 0 ? `${value} kr` : "", ov.dup_cards > 0 ? `${ov.dup_cards} ${t("Dubbletter").toLowerCase()}` : ""].filter(Boolean).join(" · ");

  return (
    <div className="ov-grid" role="group" aria-label={t("Översikt")}>
      <button type="button" className="ov-tile" onClick={onMySets}>
        <span className="label">{t("Mina set")}</span>
        <span className="ov-num">{setStats.n}</span>
        <span className="ov-sub">{setStats.n > 0 ? `${setStats.pct} % ${t("av korten")}` : t("Inga påbörjade än")}</span>
      </button>
      <button type="button" className="ov-tile" onClick={() => jump("followed")}>
        <span className="label">{t("Mina spelare")}</span>
        <span className="ov-num">{followed.length}</span>
        <span className="ov-sub">{followed.length > 0 ? `${playerPct} % ${t("av korten")}` : t("Följ en spelare från en sökning")}</span>
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
    </div>
  );
}
