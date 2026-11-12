"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

type Usage = {
  accounts: { total: number; new7: number; new30: number; active7: number; active30: number };
  collectors: { total: number; active30: number };
  cards: { total: number; added7: number; added30: number };
  weeks: { week: string; accounts: number; cards: number; collectors: number }[];
  features: {
    wishlist_users: number;
    favorite_users: number;
    trade_users: number;
    trade_requests: Record<string, number>;
    assistant_events30: number;
    assistant_users30: number;
    assistant_by_source: Record<string, number>;
    ai_calls30: number;
    ai_users30: number;
    import_jobs: Record<string, number>;
    import_users: number;
    import_pending: number;
  };
  cost: { ai_month: number; ai_cap: number; ai_calls_today: number; fetch_month: number; fetch_total30: number; fetch_failed30: number; tradera_24h: number; tradera_cached_24h: number };
  flags: { key: string; label: string; mode: "off" | "superuser" | "on" }[];
};
type Th = { id: number; key: string; ctx: string; sold: number; median: number | null; from_cache: boolean; created_at: string };
type Job = { id: number; query: string; status: string; error: string | null; created_at: string; cost_usd: number };

const when = (iso: string) => new Date(iso).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" });
const n = (v: number | string | null | undefined) => Number(v ?? 0);
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const MODE: Record<string, string> = { off: "Av", superuser: "Bara jag", on: "På för alla" };

function Bar({ value, max }: { value: number; max: number }) {
  return (
    <span style={{ flex: "0 0 110px", height: 10, borderRadius: 5, background: "var(--line)", overflow: "hidden", display: "inline-block" }} aria-hidden="true">
      <span style={{ display: "block", height: "100%", width: `${max > 0 ? Math.max(value > 0 ? 4 : 0, Math.round((value / max) * 100)) : 0}%`, background: "var(--accent)" }} />
    </span>
  );
}

// What the service is used for, as anonymous totals: who is active, which features are used, what it costs.
export default function UsagePanel({ supabase }: { supabase: SupabaseClient }) {
  const [u, setU] = useState<Usage | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [th, setTh] = useState<Th[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);

  const load = useCallback(async () => {
    setErr(null);
    const { data, error } = await supabase.rpc("admin_usage");
    if (error || !data) return setErr("Kunde inte läsa användningen. Är migration 046 körd?");
    setU(data as Usage);
    const [t, j] = await Promise.all([
      supabase.from("tradera_searches").select("id, key, ctx, sold, median, from_cache, created_at").order("created_at", { ascending: false }).limit(30),
      supabase.from("fetch_jobs").select("id, query, status, error, created_at, cost_usd").order("created_at", { ascending: false }).limit(30),
    ]);
    setTh((t.data as Th[]) || []);
    setJobs((j.data as Job[]) || []);
  }, [supabase]);
  useEffect(() => {
    load();
  }, [load]);

  if (err) return <section className="panel"><div className="note warn">{err}</div></section>;
  if (!u) return <section className="panel"><div className="note">Läser användningen…</div></section>;

  const a = u.accounts;
  const f = u.features;
  const c = u.cost;
  const maxAcc = Math.max(1, ...u.weeks.map((w) => n(w.accounts)));
  const maxCol = Math.max(1, ...u.weeks.map((w) => n(w.collectors)));
  const maxCards = Math.max(1, ...u.weeks.map((w) => n(w.cards)));
  const mode = (key: string) => u.flags.find((x) => x.key === key)?.mode;
  const aiMonth = n(c.ai_month);
  const trReq = f.trade_requests || {};
  const trTotal = Object.values(trReq).reduce((s, v) => s + n(v), 0);
  const impDone = n(f.import_jobs?.completed) + n(f.import_jobs?.partially_completed);

  // One row per feature: how it is switched, how many use it, and one sentence on what the number means.
  const rows: { name: string; flag?: string; users: number; note: string }[] = [
    { name: "Önskelista", users: n(f.wishlist_users), note: "konton med minst ett kort på önskelistan" },
    { name: "Favoriter", users: n(f.favorite_users), note: "konton som favoritmarkerat ett set eller kort" },
    { name: "Köp och sälj", users: n(f.trade_users), note: "konton som markerat kort att sälja eller köpa" },
    { name: "Bytespartners", flag: "trade_matching", users: 0, note: trTotal ? `${trTotal} förfrågningar (${Object.entries(trReq).map(([k, v]) => `${v} ${k}`).join(", ")})` : "inga förfrågningar än" },
    { name: "Samlarassistent", flag: "collector_assistant", users: n(f.assistant_users30), note: `${n(f.assistant_events30)} frågor senaste 30 dagarna` + (Object.keys(f.assistant_by_source || {}).length ? ` (${Object.entries(f.assistant_by_source).map(([k, v]) => `${v} ${{ suggestion: "förslag", rule: "regler", ai: "AI", none: "utan svar" }[k] || k}`).join(", ")})` : "") },
    { name: "AI-fallback i assistenten", flag: "assistant_ai", users: n(f.ai_users30), note: `${n(f.ai_calls30)} AI-anrop senaste 30 dagarna` },
    { name: "Importera samling", flag: "smart_import", users: n(f.import_users), note: `${impDone} importer klara, ${n(f.import_pending)} rader att reda ut` },
  ];

  return (
    <section className="panel tradera">
      <h3>Användning</h3>
      <div className="note">Anonyma summor: hur många som är aktiva, vilka funktioner som används och vad det kostar. Ingen enskild användares val visas.</div>

      <div className="label">Aktivitet</div>
      <div className="stats">
        <div><b className="mono">{a.total}</b><span>konton</span></div>
        <div><b className="mono">{a.new7}</b><span>nya senaste 7 dagarna ({a.new30} på 30)</span></div>
        <div><b className="mono">{a.active7}</b><span>inloggade senaste 7 dagarna ({a.active30} på 30)</span></div>
        <div><b className="mono">{u.collectors.total}</b><span>har börjat samla ({pct(u.collectors.total, a.total)} % av kontona)</span></div>
        <div><b className="mono">{u.cards.total}</b><span>kort i samlingarna ({u.cards.added7} nya senaste 7 dagarna)</span></div>
      </div>
      <div className="note">Per vecka, senaste åtta veckorna:</div>
      <div className="admin-table">
        {u.weeks.map((w) => (
          <div key={w.week} className="admin-row">
            <span className="mono note" style={{ flex: "0 0 70px" }}>{w.week}</span>
            <span className="note" style={{ flex: "0 0 90px" }}>{w.accounts} nya konton</span>
            <Bar value={n(w.accounts)} max={maxAcc} />
            <span className="note" style={{ flex: "0 0 110px" }}>{w.collectors} samlade</span>
            <Bar value={n(w.collectors)} max={maxCol} />
            <span className="note" style={{ flex: "0 0 100px" }}>{w.cards} kort</span>
            <Bar value={n(w.cards)} max={maxCards} />
          </div>
        ))}
      </div>

      <div className="label">Funktioner</div>
      <div className="note">Läget säger vem som ser funktionen. Antalet är hur många konton som använt den.</div>
      <div className="admin-table">
        {rows.map((r) => (
          <div key={r.name} className="admin-row">
            <span className="grow"><b>{r.name}</b><div className="note">{r.note}</div></span>
            {r.flag && <span className={`pill ${mode(r.flag) === "on" ? "src" : ""}`}>{MODE[mode(r.flag) || "off"]}</span>}
            {r.name !== "Bytespartners" && <span className="mono">{r.users} konton</span>}
          </div>
        ))}
      </div>

      <div className="label">Kostnad och gränser</div>
      <div className="stats">
        <div><b className="mono">${aiMonth.toFixed(2)} / ${c.ai_cap}</b><span>AI-kostnad denna månad mot taket</span></div>
        <div><b className="mono">{c.ai_calls_today}</b><span>AI-anrop senaste dygnet (max 10 per konto)</span></div>
        <div><b className="mono">${n(c.fetch_month).toFixed(2)}</b><span>kortlisthämtning denna månad</span></div>
        <div><b className="mono">{c.fetch_failed30} av {c.fetch_total30}</b><span>hämtningar misslyckades senaste 30 dagarna</span></div>
        <div><b className="mono">{c.tradera_24h}</b><span>Tradera-sökningar senaste dygnet ({pct(c.tradera_cached_24h, c.tradera_24h)} % ur sparat svar)</span></div>
      </div>
      <Bar value={aiMonth} max={n(c.ai_cap)} />
      {aiMonth >= n(c.ai_cap) && <div className="note warn">AI-taket är nått. Assistenten använder bara regler tills månaden byts.</div>}

      <details style={{ marginTop: 16 }}>
        <summary className="label" style={{ cursor: "pointer" }}>Tekniska loggar</summary>
        <div className="label">Tradera-sökningar (senaste 30)</div>
        {th.length ? (
          <div className="admin-table">
            {th.map((r) => (
              <div key={r.id} className="admin-row">
                <span className="mono note">{when(r.created_at)}</span>
                <span className="grow"><b>{r.key.replace(/^sold:/, "")}</b>{r.ctx ? ` · ${r.ctx}` : ""}</span>
                <span className="note mono">{r.sold} sålda{r.median ? ` · median ${r.median} kr` : ""}</span>
                <span className={`pill ${r.from_cache ? "src" : ""}`}>{r.from_cache ? "Sparat" : "Tradera"}</span>
              </div>
            ))}
          </div>
        ) : <div className="note">Inga sökningar än. Ingen information om vem som söker sparas.</div>}
        <div className="label">Hämtningar av kortlistor (senaste 30)</div>
        {jobs.length ? (
          <div className="admin-table">
            {jobs.map((j) => (
              <div key={j.id} className="admin-row">
                <span className="mono note">{when(j.created_at)}</span>
                <span className="grow">{j.query}</span>
                <span className={`pill ${j.status === "done" ? "src" : ""}`}>{{ done: "Klar", failed: "Misslyckad", running: "Pågår" }[j.status] || j.status}</span>
                {n(j.cost_usd) > 0 && <span className="note mono">≈ ${n(j.cost_usd).toFixed(2)}</span>}
                {j.error && <span className="note warn">{j.error}</span>}
              </div>
            ))}
          </div>
        ) : <div className="note">Inga hämtningar än.</div>}
      </details>
    </section>
  );
}
