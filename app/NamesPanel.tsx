"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import "./panels.css";

type Kind = "set" | "player" | "team";
type Hit = { value: string; cards: number; sets: number; id?: string; short?: string | null };
type Log = { id: number; kind: Kind; old_value: string; new_value: string; affected: number; created_at: string; undone_at: string | null };

const KIND: Record<Kind, string> = { set: "Set", player: "Spelare", team: "Lag" };
const PLACEHOLDER: Record<Kind, string> = { set: "Sök set, till exempel Prizm eller Bundesliga", player: "Sök spelare, minst tre tecken", team: "Sök lag, minst tre tecken" };

// Superuser: correct a misspelt name of a set, a player or a team. Player and team names are text on every card, so a
// correction changes every card with exactly that spelling (after a preview). Every correction is logged and can be undone.
export default function NamesPanel({ supabase, onClose }: { supabase: SupabaseClient; onClose: () => void }) {
  const [kind, setKind] = useState<Kind>("set");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [sel, setSel] = useState<Hit | null>(null);
  const [nv, setNv] = useState("");
  const [short, setShort] = useState("");
  const [prev, setPrev] = useState<{ cards: number; sets: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [log, setLog] = useState<Log[]>([]);
  const [undoId, setUndoId] = useState<number | null>(null);

  const loadLog = useCallback(async () => {
    const { data } = await supabase.from("name_corrections").select("id, kind, old_value, new_value, affected, created_at, undone_at").order("id", { ascending: false }).limit(20);
    setLog((data as Log[]) || []);
  }, [supabase]);
  useEffect(() => {
    loadLog();
  }, [loadLog]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Search as you type (after a short pause).
  useEffect(() => {
    setSel(null);
    setPrev(null);
    const term = q.trim();
    if (term.length < 3) {
      setHits([]);
      return;
    }
    let live = true;
    const h = setTimeout(async () => {
      if (kind === "set") {
        const { data, error } = await supabase.from("set_stats").select("id, name, short_name, card_count").ilike("name", `%${term.replace(/[%_\\]/g, "\\$&")}%`).order("name").limit(30);
        if (!live) return;
        if (error) return setMsg("Sökningen misslyckades.");
        setHits(((data as { id: string; name: string; short_name: string | null; card_count: number }[]) || []).map((s) => ({ value: s.name, id: s.id, short: s.short_name, cards: s.card_count, sets: 1 })));
      } else {
        const { data, error } = await supabase.rpc("admin_search_names", { p_kind: kind, q: term });
        if (!live) return;
        if (error) return setMsg("Sökningen misslyckades.");
        setHits(((data as { value: string; cards: number | string; sets: number | string }[]) || []).map((r) => ({ value: r.value, cards: Number(r.cards), sets: Number(r.sets) })));
      }
    }, 350);
    return () => {
      live = false;
      clearTimeout(h);
    };
  }, [q, kind, supabase]);

  const pick = (h: Hit) => {
    setSel(h);
    setNv(h.value);
    setShort(h.short || "");
    setPrev(null);
    setMsg(null);
  };

  const changed = !!sel && (kind === "set" ? nv.trim() !== sel.value || short.trim() !== (sel.short || "") : nv.trim() !== sel.value);
  const valid = !!sel && changed && nv.trim().length >= (kind === "set" ? 3 : 1);

  const preview = async () => {
    if (!sel || !valid) return;
    if (kind === "set") return setPrev({ cards: sel.cards, sets: 1 });
    setBusy(true);
    const { data, error } = await supabase.rpc("admin_name_preview", { p_kind: kind, p_old: sel.value });
    setBusy(false);
    const r = (data as { cards: number | string; sets: number | string }[] | null)?.[0];
    if (error || !r) return setMsg("Kunde inte räkna kort.");
    setPrev({ cards: Number(r.cards), sets: Number(r.sets) });
  };

  const apply = async () => {
    if (!sel || !valid || !prev) return;
    setBusy(true);
    setMsg(null);
    const { error } =
      kind === "set"
        ? await supabase.rpc("admin_rename_set", { p_id: sel.id, p_name: nv.trim(), p_short: short.trim() })
        : await supabase.rpc("admin_rename_name", { p_kind: kind, p_old: sel.value, p_new: nv.trim() });
    setBusy(false);
    if (error) return setMsg(`Kunde inte spara: ${error.message}`);
    setMsg(`Klart: “${sel.value}” heter nu “${nv.trim()}”. Rättelsen går att ångra i listan nedan.`);
    setSel(null);
    setPrev(null);
    setQ("");
    loadLog();
  };

  const undo = async (id: number) => {
    setBusy(true);
    const { error } = await supabase.rpc("admin_undo_correction", { p_id: id });
    setBusy(false);
    setUndoId(null);
    if (error) return setMsg(`Kunde inte ångra: ${error.message}`);
    setMsg("Rättelsen är ångrad.");
    loadLog();
  };

  return (
    <div className="t-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="panel tradera" role="dialog" aria-modal="true" aria-label="Rätta namn">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3>Rätta namn</h3>
          <button className="btn small ghost" type="button" onClick={onClose}>Stäng</button>
        </div>
        <div className="note">Sök fram namnet, skriv rätt stavning och förhandsgranska. För spelare och lag byts alla kort med exakt samma stavning, i alla set. Allt loggas och går att ångra.</div>
        {msg && <div className="note" role="status">{msg}</div>}

        <div className="seg" role="group" aria-label="Vad vill du rätta?">
          {(["set", "player", "team"] as Kind[]).map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => { setKind(k); setQ(""); setMsg(null); }}>{KIND[k]}</button>
          ))}
        </div>
        <input className="t-input" style={{ width: "100%" }} type="search" placeholder={PLACEHOLDER[kind]} aria-label={PLACEHOLDER[kind]} value={q} onChange={(e) => setQ(e.target.value)} />

        {!sel && hits.map((h) => (
          <button key={(h.id || "") + h.value} type="button" className="par-row" style={{ textAlign: "left", width: "100%" }} onClick={() => pick(h)}>
            <span className="grow">{h.value}{kind === "set" && h.short ? ` (${h.short})` : ""}</span>
            <span className="note mono">{h.cards.toLocaleString("sv-SE")} kort{kind !== "set" ? ` · ${h.sets.toLocaleString("sv-SE")} set` : ""}</span>
          </button>
        ))}
        {!sel && q.trim().length >= 3 && !hits.length && <div className="note">Inga träffar.</div>}

        {sel && (
          <div className="wish-box">
            <div className="label">Nu: {sel.value}</div>
            <input className="t-input" style={{ width: "100%" }} maxLength={200} value={nv} onChange={(e) => { setNv(e.target.value); setPrev(null); }} aria-label="Rätt stavning" />
            {kind === "set" && (
              <>
                <div className="label">Kortnamn (visas i listor om det finns; lämna tomt för att använda hela namnet)</div>
                <input className="t-input" style={{ width: "100%" }} maxLength={120} value={short} onChange={(e) => { setShort(e.target.value); setPrev(null); }} aria-label="Kortnamn" />
              </>
            )}
            {prev && (
              <div className="note">
                {kind === "set" ? "Byter namn på det här setet." : `Ändrar ${prev.cards.toLocaleString("sv-SE")} kort i ${prev.sets.toLocaleString("sv-SE")} set.`} “{sel.value}” blir “{nv.trim()}”.
              </div>
            )}
            <div className="row">
              {!prev ? (
                <button className="btn" type="button" disabled={!valid || busy} onClick={preview}>Förhandsgranska</button>
              ) : (
                <button className="btn primary" type="button" disabled={busy} onClick={apply}>Bekräfta och spara</button>
              )}
              <button className="btn ghost" type="button" onClick={() => { setSel(null); setPrev(null); }}>Avbryt</button>
            </div>
          </div>
        )}

        <div className="label">Senaste rättelser</div>
        {!log.length && <div className="note">Inga rättelser än.</div>}
        {log.map((l) => (
          <div key={l.id} className="par-row">
            <span className="grow">
              <b>{KIND[l.kind]}:</b> {l.old_value} → {l.new_value}
              <span className="note"> · {l.affected.toLocaleString("sv-SE")} kort · {new Date(l.created_at).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}{l.undone_at ? " · ångrad" : ""}</span>
            </span>
            {!l.undone_at && (undoId === l.id ? (
              <>
                <button className="btn small danger" type="button" disabled={busy} onClick={() => undo(l.id)}>Ångra nu</button>
                <button className="btn small ghost" type="button" onClick={() => setUndoId(null)}>Behåll</button>
              </>
            ) : (
              <button className="btn small ghost" type="button" onClick={() => setUndoId(l.id)}>Ångra</button>
            ))}
          </div>
        ))}
      </section>
    </div>
  );
}
