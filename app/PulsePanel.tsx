"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SPORTS } from "@/lib/checklist";
import { useT } from "@/lib/i18n";
import { type PulseItem, describe, nextBest, splitFeed } from "@/lib/pulse";

type Feed = {
  on: boolean;
  first_visit?: boolean;
  last_visit?: string | null;
  since_last?: number;
  items?: PulseItem[];
  my_sports?: string[];
  prefs?: { enabled_types: string[]; sports: string[] };
  kinds?: { milestone: boolean; newset: boolean; trade: boolean };
};

const when = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });

// Pulse: what has happened for the collection since the last visit. Everything comes from the database (real data only, no AI).
export default function PulsePanel({ supabase, onOpenSet, onOpenTrade }: { supabase: SupabaseClient; onOpenSet: (id: string) => void; onOpenTrade: () => void }) {
  const t = useT();
  const [feed, setFeed] = useState<Feed | null>(null);
  const [err, setErr] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [types, setTypes] = useState<string[]>([]);
  const [sports, setSports] = useState<string[]>([]);
  const counted = useRef(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("pulse_get");
    if (error || !data) {
      setErr(true);
      return;
    }
    const f = data as Feed;
    setErr(false);
    setFeed(f);
    if (f.prefs) {
      setTypes(f.prefs.enabled_types);
      setSports(f.prefs.sports.length ? f.prefs.sports : f.my_sports || []);
    }
    // an impression is counted once per page load, and only when there is something to show
    if (!counted.current && f.items && splitFeed(f.items).current.length > 0) {
      counted.current = true;
      void supabase.rpc("pulse_track", { p_kind: "impression" });
    }
  }, [supabase]);
  useEffect(() => {
    load();
  }, [load]);

  if (err || !feed || !feed.on) return null;

  const items = feed.items || [];
  const { current, history } = splitFeed(items);
  const best = nextBest(items);
  const kinds = feed.kinds || { milestone: false, newset: false, trade: false };

  const act = async (it: PulseItem) => {
    const d = describe(it);
    void supabase.rpc("pulse_track", { p_kind: "click" });
    if (it.status === "new") await supabase.rpc("pulse_mark", { p_id: it.id, p_status: "seen" });
    if (d.action === "set" && d.setId) onOpenSet(d.setId);
    else if (d.action === "trade") onOpenTrade();
    else load();
  };
  const dismiss = async (it: PulseItem) => {
    void supabase.rpc("pulse_track", { p_kind: "dismiss" });
    await supabase.rpc("pulse_mark", { p_id: it.id, p_status: "dismissed" });
    load();
  };
  const saveSettings = async () => {
    await supabase.rpc("pulse_set_prefs", { p_types: types, p_sports: sports });
    setShowSettings(false);
    load();
  };
  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const Card = ({ it }: { it: PulseItem }) => {
    const d = describe(it);
    return (
      <div className="admin-row" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
        <div className="grow" style={{ minWidth: 220 }}>
          <div>
            <b>{t(d.title)}</b>
            {d.name ? <span> · {d.name}</span> : null}
            {d.facts ? <span className="mono"> · {d.facts}</span> : null}
            {it.status === "new" ? <span className="pill src" style={{ marginLeft: 8 }}>{t("Ny")}</span> : null}
          </div>
          {d.why ? <div className="note">{t(d.why)} · {when(it.created_at)}</div> : null}
        </div>
        {it.status === "new" || it.status === "seen" ? (
          <>
            {d.action !== "none" && <button className="btn small primary" type="button" onClick={() => act(it)}>{d.action === "trade" ? t("Granska") : t("Öppna")}</button>}
            <button className="btn small ghost" type="button" onClick={() => dismiss(it)}>{t("Dölj")}</button>
          </>
        ) : (
          <span className="note">{it.status === "dismissed" ? t("Dold") : it.status === "expired" ? t("Utgången") : ""}</span>
        )}
      </div>
    );
  };

  return (
    <section className="panel" aria-label={t("Din samlings-Pulse")}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0 }}>{t("Din samlings-Pulse")}</h3>
          <div className="note">{t("Se vad som är nytt för din samling.")}</div>
        </div>
        <button className="btn small ghost" type="button" onClick={() => setShowSettings((v) => !v)}>{t("Inställningar")}</button>
      </div>

      {showSettings && (
        <div className="panel" style={{ marginTop: 10 }}>
          <div className="label">{t("Visa")}</div>
          <div className="row" style={{ flexWrap: "wrap", gap: 12 }}>
            <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={types.includes("almost")} onChange={() => toggle(types, setTypes, "almost")} /><span>{t("Nästan kompletta set")}</span></label>
            {kinds.milestone && <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={types.includes("milestone")} onChange={() => toggle(types, setTypes, "milestone")} /><span>{t("Milstolpar")}</span></label>}
            {kinds.newset && <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={types.includes("newset")} onChange={() => toggle(types, setTypes, "newset")} /><span>{t("Nya set")}</span></label>}
            {kinds.trade && <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={types.includes("trade")} onChange={() => toggle(types, setTypes, "trade")} /><span>{t("Bytesmöjligheter")}</span></label>}
          </div>
          {kinds.newset && (
            <>
              <div className="label" style={{ marginTop: 10 }}>{t("Sporter för nya set")}</div>
              <div className="row" style={{ flexWrap: "wrap", gap: 12 }}>
                {SPORTS.map((s) => (
                  <label key={s.id} className="row" style={{ gap: 6 }}><input type="checkbox" checked={sports.includes(s.id)} onChange={() => toggle(sports, setSports, s.id)} /><span>{t(s.label)}</span></label>
                ))}
              </div>
            </>
          )}
          <div className="note" style={{ marginTop: 10 }}>{t("Inget skickas till din e-post. Pulse visas bara här.")}</div>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn small primary" type="button" onClick={saveSettings}>{t("Spara")}</button>
            <button className="btn small ghost" type="button" onClick={() => setShowSettings(false)}>{t("Avbryt")}</button>
          </div>
        </div>
      )}

      <div className="stats" style={{ marginTop: 10 }}>
        <div><b className="mono">{feed.since_last ?? 0}</b><span>{t("nya sedan ditt förra besök")}</span></div>
        <div><b className="mono">{current.length}</b><span>{t("aktuella möjligheter")}</span></div>
      </div>

      {best && (
        <div style={{ marginTop: 10 }}>
          <div className="label">{t("Ditt nästa drag")}</div>
          <Card it={best} />
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <div className="label">{t("Senaste möjligheter")}</div>
        {current.filter((i) => i.id !== best?.id).length ? (
          <div className="admin-table">{current.filter((i) => i.id !== best?.id).map((i) => <Card key={i.id} it={i} />)}</div>
        ) : !best ? (
          <div className="note">{feed.first_visit ? t("Välkommen till Pulse. Nya möjligheter visas här när de dyker upp.") : t("Du är i fatt. Nya möjligheter visas här när de dyker upp.")}</div>
        ) : null}
      </div>

      {history.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary>{t("Tidigare händelser")} ({history.length})</summary>
          <div className="admin-table">{history.map((i) => <Card key={i.id} it={i} />)}</div>
        </details>
      )}
    </section>
  );
}
