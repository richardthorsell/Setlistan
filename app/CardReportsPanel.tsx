"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

type Status = "ny" | "granskas" | "klar" | "avvisad";
type Report = { id: number; set_id: string | null; set_name: string; player: string | null; card_no: string | null; card_name: string | null; note: string | null; status: Status; admin_note: string | null; created_at: string; same_count: number };
const STATUS: Record<Status, string> = { ny: "Ny", granskas: "Granskas", klar: "Klar", avvisad: "Avvisad" };
const when = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { dateStyle: "short" });

// Reports from users about cards missing in a set. Who sent them is never shown, and nothing is added to the catalogue from here.
export default function CardReportsPanel({ supabase, say }: { supabase: SupabaseClient; say: (m: string) => void }) {
  const [rows, setRows] = useState<Report[] | null>(null);
  const [open, setOnly] = useState(true);
  const [notes, setNotes] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("card_reports_list");
    if (error) return setRows([]);
    setRows(((data as Report[]) || []).map((r) => ({ ...r, same_count: Number(r.same_count) })));
  }, [supabase]);
  useEffect(() => {
    load();
  }, [load]);

  const save = async (r: Report, status: Status) => {
    const { error } = await supabase.rpc("card_report_set_status", { p_id: r.id, p_status: status, p_note: notes[r.id] ?? r.admin_note ?? "" });
    if (error) return say("Kunde inte spara.");
    await load();
  };

  if (rows === null) return <section className="panel"><div className="note">Läser …</div></section>;
  const shown = rows.filter((r) => !open || r.status === "ny" || r.status === "granskas");

  return (
    <section className="panel">
      <h3>Rapporterade kort</h3>
      <div className="note">Kort som användare sagt saknas i ett set. Du ser aldrig vem som rapporterade, och ingenting läggs in i katalogen härifrån. Lägg in kortet i setet på vanligt sätt och markera rapporten som klar.</div>
      <label className="row" style={{ gap: 6 }}>
        <input type="checkbox" checked={open} onChange={(e) => setOnly(e.target.checked)} />
        <span>Visa bara öppna</span>
      </label>
      {shown.map((r) => (
        <div key={r.id} className="wish-box">
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <b>{r.set_name}: {[r.card_no, r.card_name].filter(Boolean).join(" ")}</b>
            <span className="pill">{STATUS[r.status]}</span>
          </div>
          <div className="note">{when(r.created_at)}{r.same_count > 1 ? ` · ${r.same_count} har rapporterat samma kort` : ""}</div>
          {!r.set_id && <div className="note">Setet finns inte i katalogen, texten är skriven av användaren.</div>}
          {r.player && <div className="note">Spelare: {r.player}</div>}
          {r.note && <div className="note">Meddelande: {r.note}</div>}
          <input className="t-input" style={{ width: "100%" }} maxLength={500} placeholder="Anteckning" defaultValue={r.admin_note || ""} onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))} />
          <div className="row" style={{ flexWrap: "wrap" }}>
            {(["granskas", "klar", "avvisad", "ny"] as Status[]).filter((s) => s !== r.status).map((s) => (
              <button key={s} className="btn small" type="button" onClick={() => save(r, s)}>{STATUS[s]}</button>
            ))}
          </div>
        </div>
      ))}
      {!shown.length && <div className="note">Inga rapporter här.</div>}
    </section>
  );
}
