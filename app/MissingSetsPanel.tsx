"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

type Ticket = {
  ticket_key: string; kind: "set" | "cards"; set_text: string; year: number | null; users: number; import_rows: number; cards: number;
  results: Record<string, number>; examples: string[]; first_seen: string; last_seen: string; priority: number;
  status: Status; note: string | null; linked_set_id: string | null; priority_adjust: number;
};
type Status = "ny" | "granskas" | "dubblett" | "avvisad" | "klar";
const STATUS: Record<Status, string> = { ny: "Ny", granskas: "Granskas", dubblett: "Dubblett", avvisad: "Avvisad", klar: "Klar" };
const when = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { dateStyle: "short" });

// What the imports could not find, grouped. Only counts and the texts from the files are shown, never who imported.
export default function MissingSetsPanel({ supabase, say }: { supabase: SupabaseClient; say: (m: string) => void }) {
  const [rows, setRows] = useState<Ticket[] | null>(null);
  const [filter, setFilter] = useState<Status | "open">("open");
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("msi_tickets");
    if (error) return setRows([]);
    setRows(((data as Ticket[]) || []).map((t) => ({ ...t, users: Number(t.users), import_rows: Number(t.import_rows), cards: Number(t.cards), priority: Number(t.priority) })));
  }, [supabase]);
  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => (rows || []).filter((t) => (filter === "open" ? t.status === "ny" || t.status === "granskas" : t.status === filter)), [rows, filter]);

  const save = async (t: Ticket, patch: Partial<{ status: Status; note: string | null; linked: string | null; adjust: number }>) => {
    const { error } = await supabase.rpc("msi_set_ticket", {
      p_key: t.ticket_key, p_status: patch.status ?? t.status, p_note: patch.note !== undefined ? patch.note : t.note,
      p_linked: patch.linked !== undefined ? patch.linked : t.linked_set_id, p_adjust: patch.adjust ?? t.priority_adjust,
    });
    if (error) return say("Kunde inte spara ärendet.");
    await load();
  };

  const searchSets = async () => {
    if (q.trim().length < 2) return;
    const { data } = await supabase.from("sets").select("id, name").ilike("name", `%${q.trim()}%`).limit(8);
    setFound((data as { id: string; name: string }[]) || []);
  };

  const digest = () =>
    shown.map((t) => `${t.priority.toFixed(1)}  ${t.kind === "set" ? "Set saknas" : "Kort saknas i"}: ${t.set_text}${t.year ? ` (${t.year})` : ""} – ${t.users} användare, ${t.cards} kort`).join("\n");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(digest());
      say("Sammanställningen är kopierad");
    } catch {
      say("Kunde inte kopiera");
    }
  };
  const mail = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/admin-digest", { method: "POST" });
      const j = (await r.json()) as { sent?: boolean; error?: string };
      say(r.ok && j.sent ? "Sammanställningen är skickad till din e-post" : j.error === "not configured" ? "E-post är inte konfigurerad än" : "Kunde inte skicka sammanställningen");
    } catch {
      say("Kunde inte skicka sammanställningen");
    }
    setBusy(false);
  };

  if (rows === null) return <section className="panel"><div className="note">Läser …</div></section>;

  return (
    <section className="panel tradera">
      <h3>Saknade set och kort</h3>
      <div className="note">Det som användarnas importer inte hittade i katalogen, grupperat. Du ser bara antal och texterna från filerna, aldrig vem som importerade. Ingenting läggs in i katalogen eller i någons samling från den här sidan. Prioriteten är 10 poäng per berörd användare, plus antal olika kort (högst 300) delat med 10, plus en halv poäng per dag som ärendet väntat, plus din justering.</div>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <div className="seg" role="group" aria-label="Visa">
          {([["open", "Öppna"], ["ny", "Nya"], ["granskas", "Granskas"], ["dubblett", "Dubbletter"], ["avvisad", "Avvisade"], ["klar", "Klara"]] as [Status | "open", string][]).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
        <button className="btn small ghost" type="button" onClick={copy} disabled={!shown.length}>Kopiera som text</button>
        <button className="btn small ghost" type="button" onClick={mail} disabled={busy}>Skicka till min e-post</button>
      </div>

      {shown.map((t) => (
        <div key={t.ticket_key} className="wish-box">
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <b>{t.kind === "set" ? "Set saknas" : "Kort saknas i"}: {t.set_text}{t.year ? ` (${t.year})` : ""}</b>
            <span className="pill">{STATUS[t.status]}</span>
          </div>
          <div className="note">{t.users} användare · {t.cards} olika kort · {t.import_rows} rader · prioritet {t.priority.toFixed(1)} · första {when(t.first_seen)}, senaste {when(t.last_seen)}</div>
          <button className="btn small ghost" type="button" onClick={() => { setOpen(open === t.ticket_key ? null : t.ticket_key); setNote(t.note || ""); setFound([]); setQ(t.set_text); }}>{open === t.ticket_key ? "Dölj" : "Öppna"}</button>
          {open === t.ticket_key && (
            <>
              {t.examples.length > 0 && <div className="note">Exempel: {t.examples.join(" · ")}</div>}
              {t.linked_set_id && <div className="note">Kopplat till set: {t.linked_set_id}</div>}
              <div className="row" style={{ flexWrap: "wrap" }}>
                {(["granskas", "dubblett", "avvisad", "klar", "ny"] as Status[]).filter((s) => s !== t.status).map((s) => (
                  <button key={s} className="btn small" type="button" onClick={() => save(t, { status: s, note: note || null })}>{STATUS[s]}</button>
                ))}
                <button className="btn small ghost" type="button" onClick={() => save(t, { adjust: Math.min(100, t.priority_adjust + 10) })}>Prioritet +10</button>
                <button className="btn small ghost" type="button" onClick={() => save(t, { adjust: Math.max(-100, t.priority_adjust - 10) })}>Prioritet −10</button>
              </div>
              <input className="t-input" style={{ width: "100%" }} maxLength={500} placeholder="Anteckning" value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (t.note || "") && save(t, { note: note || null })} />
              <div className="row" style={{ flexWrap: "wrap" }}>
                <input className="t-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Koppla till befintligt set" aria-label="Sök set" />
                <button className="btn small" type="button" onClick={searchSets}>Sök</button>
                {found.map((s) => (<button key={s.id} className="btn small ghost" type="button" onClick={() => save(t, { linked: s.id, status: "dubblett" })}>{s.name}</button>))}
              </div>
            </>
          )}
        </div>
      ))}
      {!shown.length && <div className="note">Inga ärenden här. Ärenden uppstår när användare importerar kort som inte finns i katalogen.</div>}
    </section>
  );
}
