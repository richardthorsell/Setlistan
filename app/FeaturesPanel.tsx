"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import "./panels.css";
import { type FeatureFlag, type FeatureMode, MODE_LABEL } from "@/lib/features";

// Superuser: switch features off, on for yourself only, or on for everyone. New features add a row to feature_flags.
export default function FeaturesPanel({ supabase, onClose, onChanged }: { supabase: SupabaseClient; onClose: () => void; onChanged: () => void }) {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("feature_flags").select("key, label, description, mode").order("label");
    if (error) return setMsg("Kunde inte läsa funktionerna.");
    setFlags((data as FeatureFlag[]) || []);
  }, [supabase]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = async (f: FeatureFlag, mode: FeatureMode) => {
    if (mode === f.mode) return;
    setBusy(f.key);
    setMsg(null);
    const { error } = await supabase.from("feature_flags").update({ mode }).eq("key", f.key);
    setBusy(null);
    if (error) return setMsg(`Kunde inte spara: ${error.message}`);
    setMsg(`${f.label}: ${MODE_LABEL[mode].toLowerCase()}.`);
    await load();
    onChanged();
  };

  return (
    <div className="t-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="panel tradera" role="dialog" aria-modal="true" aria-label="Funktioner">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3>Funktioner</h3>
          <button className="btn small ghost" type="button" onClick={onClose}>Stäng</button>
        </div>
        <div className="note">Slå på och av funktioner. “Bara jag” visar funktionen bara för dig så att du kan prova den. “På för alla” visar den för alla inloggade. Ändringen gäller direkt vid nästa sidladdning.</div>
        {msg && <div className="note" role="status">{msg}</div>}
        {flags.map((f) => (
          <div key={f.key} className="wish-box">
            <b>{f.label}</b>
            {f.description && <div className="note">{f.description}</div>}
            <div className="seg" role="group" aria-label={f.label}>
              {(["off", "superuser", "on"] as FeatureMode[]).map((m) => (
                <button key={m} type="button" disabled={busy === f.key} aria-pressed={f.mode === m} onClick={() => set(f, m)}>{MODE_LABEL[m]}</button>
              ))}
            </div>
          </div>
        ))}
        {!flags.length && <div className="note">Inga funktioner att styra än.</div>}
      </section>
    </div>
  );
}
