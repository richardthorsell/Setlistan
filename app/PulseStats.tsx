"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

type Stats = {
  launched_at: string | null;
  visitors7: number;
  visitors30: number;
  returning7: number;
  week2: { eligible: number; returned: number };
  week4: { eligible: number; returned: number };
  items: { kind: string; status: string; n: number }[];
  metrics30: Record<string, number>;
  weeks: { week: string; pulse_users: number; collectors: number; cards: number }[];
};

const KIND: Record<string, string> = { almost: "Nästan kompletta", milestone: "Milstolpar", newset: "Nya set", trade: "Bytesmöjligheter", listing: "Saknade kort på Tradera", checklist: "Uppdaterade checklistor" };
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)} %` : "ingen data än");

// Admin view of Pulse: use, and whether it leads to real collecting. Totals only, no user ids.
export default function PulseStats({ supabase }: { supabase: SupabaseClient }) {
  const [s, setS] = useState<Stats | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("admin_pulse_stats");
    if (error || !data) return setErr("Kunde inte läsa Pulse. Är migration 053 körd?");
    setErr(null);
    setS(data as Stats);
  }, [supabase]);
  useEffect(() => {
    load();
  }, [load]);

  if (err) return <section className="panel"><div className="note warn">{err}</div></section>;
  if (!s) return <section className="panel"><div className="note">Läser Pulse…</div></section>;

  const m = s.metrics30;
  const byKind = new Map<string, Record<string, number>>();
  for (const i of s.items) byKind.set(i.kind, { ...(byKind.get(i.kind) || {}), [i.status]: Number(i.n) });

  return (
    <section className="panel">
      <h3>Pulse</h3>
      <div className="note">Slå på och av under Funktioner. Siffrorna räknas ihop och innehåller inga personuppgifter.{s.launched_at ? ` Första besöket: ${new Date(s.launched_at).toLocaleDateString("sv-SE")}.` : " Ingen har öppnat Pulse än."}</div>

      <div className="stats" style={{ marginTop: 10 }}>
        <div><b className="mono">{s.visitors7}</b><span>besökare 7 dagar</span></div>
        <div><b className="mono">{s.visitors30}</b><span>besökare 30 dagar</span></div>
        <div><b className="mono">{s.returning7}</b><span>återkom inom 7 dagar</span></div>
        <div><b className="mono">{pct(s.week2.returned, s.week2.eligible)}</b><span>kom tillbaka vecka 2 ({s.week2.returned}/{s.week2.eligible})</span></div>
        <div><b className="mono">{pct(s.week4.returned, s.week4.eligible)}</b><span>kom tillbaka vecka 4 ({s.week4.returned}/{s.week4.eligible})</span></div>
      </div>

      <div className="label" style={{ marginTop: 12 }}>Senaste 30 dagarna</div>
      <div className="stats">
        <div><b className="mono">{m.impression ?? 0}</b><span>visningar</span></div>
        <div><b className="mono">{m.click ?? 0}</b><span>klick</span></div>
        <div><b className="mono">{m.dismiss ?? 0}</b><span>dolda</span></div>
      </div>

      <div className="label" style={{ marginTop: 12 }}>Händelser</div>
      {byKind.size ? (
        <div className="admin-table">
          {[...byKind.entries()].map(([k, v]) => (
            <div key={k} className="admin-row">
              <span className="grow">{KIND[k] || k}</span>
              <span className="mono note">nya {v.new ?? 0} · sedda {v.seen ?? 0} · dolda {v.dismissed ?? 0} · utgångna {v.expired ?? 0}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="note">Inga händelser har skapats än.</div>
      )}

      <div className="label" style={{ marginTop: 12 }}>Före och efter lansering: faktisk samlaraktivitet per vecka</div>
      <div className="admin-table">
        {s.weeks.map((w) => (
          <div key={w.week} className="admin-row">
            <span className="mono">{w.week}</span>
            <span className="grow" />
            <span className="mono note">{w.pulse_users} använde Pulse · {w.collectors} samlare la till kort · {w.cards} kort</span>
          </div>
        ))}
      </div>
    </section>
  );
}
