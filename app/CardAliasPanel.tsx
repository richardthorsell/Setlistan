"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import "./panels.css";

type SetHit = { id: string; name: string; short_name: string | null; card_count: number };
type CardRow = { id: number; no: number; name: string; team: string; sections: { code: string; name: string } | null };
type Alias = { id: number; card_id: number; alias: string };

const label = (c: CardRow) => (c.sections?.code ? `${c.sections.code} ${c.no}` : String(c.no));
const esc = (s: string) => s.replace(/[%_\\]/g, "\\$&");

// Superuser: give one specific card other names. Used by the search and by import matching, not shown to users.
// A card is identified by its id, so cards with exactly the same name can each get their own alias.
export default function CardAliasPanel({ supabase, onClose }: { supabase: SupabaseClient; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [sets, setSets] = useState<SetHit[]>([]);
  const [set, setSet] = useState<SetHit | null>(null);
  const [f, setF] = useState("");
  const [cards, setCards] = useState<CardRow[]>([]);
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [nv, setNv] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  // Find the set first (the library has millions of cards, so a card is looked up inside one set).
  useEffect(() => {
    const term = q.trim();
    if (set || term.length < 3) {
      setSets([]);
      return;
    }
    let live = true;
    const h = setTimeout(async () => {
      const { data, error } = await supabase.from("set_stats").select("id, name, short_name, card_count").ilike("name", `%${esc(term)}%`).order("name").limit(20);
      if (!live) return;
      if (error) return setMsg("Sökningen misslyckades.");
      setSets((data as SetHit[]) || []);
    }, 300);
    return () => {
      live = false;
      clearTimeout(h);
    };
  }, [q, set, supabase]);

  const loadCards = useCallback(async () => {
    if (!set) return;
    const term = f.trim();
    let query = supabase.from("cards").select("id, no, name, team, sections(code, name)").eq("set_id", set.id).order("section_id").order("no").limit(60);
    if (/^\d{1,5}$/.test(term)) query = query.eq("no", Number(term));
    else if (term) query = query.ilike("name", `%${esc(term)}%`);
    const { data, error } = await query;
    if (error) return setMsg("Kunde inte läsa korten.");
    const rows = ((data as unknown as CardRow[]) || []).map((c) => ({ ...c, sections: Array.isArray(c.sections) ? (c.sections as unknown as { code: string; name: string }[])[0] ?? null : c.sections }));
    setCards(rows);
    if (rows.length) {
      const a = await supabase.from("card_aliases").select("id, card_id, alias").in("card_id", rows.map((c) => c.id)).order("id");
      setAliases((a.data as Alias[]) || []);
    } else setAliases([]);
  }, [supabase, set, f]);
  useEffect(() => {
    const h = setTimeout(loadCards, 250);
    return () => clearTimeout(h);
  }, [loadCards]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const fail = (e: { message: string }) =>
    setMsg(/same as the card name/.test(e.message) ? "Aliaset är samma som kortets namn." : /already exists/.test(e.message) ? "Det aliaset finns redan på kortet." : /bad alias/.test(e.message) ? "Skriv ett alias på 1–120 tecken." : `Kunde inte spara: ${e.message}`);

  const add = async (card: CardRow) => {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc("admin_add_card_alias", { p_card_id: card.id, p_alias: nv });
    setBusy(false);
    if (error) return fail(error);
    setNv("");
    setMsg(`Alias tillagt på ${label(card)}.`);
    loadCards();
  };
  const remove = async (a: Alias) => {
    setBusy(true);
    const { error } = await supabase.rpc("admin_remove_card_alias", { p_id: a.id });
    setBusy(false);
    if (error) return fail(error);
    setMsg(`Aliaset “${a.alias}” är borttaget.`);
    loadCards();
  };
  const promote = async (a: Alias) => {
    setBusy(true);
    const { error } = await supabase.rpc("admin_alias_to_name", { p_id: a.id });
    setBusy(false);
    setConfirmId(null);
    if (error) return fail(error);
    setMsg(`“${a.alias}” är nu kortets namn. Det gamla namnet finns kvar som alias, och ändringen går att ångra under Rätta namn.`);
    loadCards();
  };

  return (
    <div className="t-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="panel tradera" role="dialog" aria-modal="true" aria-label="Kortnamn">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3>Kortnamn</h3>
          <button className="btn small ghost" type="button" onClick={onClose}>Stäng</button>
        </div>
        <div className="note">Ge ett enskilt kort andra namn. Aliasen används bara i sökning och import och visas inte för användarna. Du kan också göra ett alias till kortets namn. Kortet pekas ut med sitt id, så flera kort med exakt samma namn kan få var sitt alias.</div>
        {msg && <div className="note" role="status">{msg}</div>}

        {!set && (
          <>
            <input className="t-input" style={{ width: "100%" }} type="search" placeholder="Sök set, till exempel Semic Globe" aria-label="Sök set" value={q} onChange={(e) => setQ(e.target.value)} />
            {sets.map((s) => (
              <button key={s.id} type="button" className="par-row" style={{ textAlign: "left", width: "100%" }} onClick={() => { setSet(s); setF(""); setOpen(null); setMsg(null); }}>
                <span className="grow">{s.short_name || s.name}</span>
                <span className="note mono">{s.card_count.toLocaleString("sv-SE")} kort</span>
              </button>
            ))}
            {q.trim().length >= 3 && !sets.length && <div className="note">Inga set hittades.</div>}
          </>
        )}

        {set && (
          <>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <b>{set.short_name || set.name}</b>
              <button className="btn small ghost" type="button" onClick={() => { setSet(null); setCards([]); setAliases([]); setOpen(null); }}>Byt set</button>
            </div>
            <input className="t-input" style={{ width: "100%" }} type="search" placeholder="Filtrera på namn eller kortnummer" aria-label="Filtrera kort" value={f} onChange={(e) => setF(e.target.value)} />
            {!cards.length && <div className="note">Inga kort hittades. Visar högst 60 kort åt gången.</div>}
            {cards.map((c) => {
              const mine = aliases.filter((a) => a.card_id === c.id);
              return (
                <div key={c.id} className="wish-box">
                  <button type="button" className="par-row" style={{ textAlign: "left", width: "100%" }} onClick={() => { setOpen(open === c.id ? null : c.id); setNv(""); setConfirmId(null); }}>
                    <span className="mono note">{label(c)}</span>
                    <span className="grow"><b>{c.name}</b>{c.team ? <span className="note"> · {c.team}</span> : null}</span>
                    <span className="note">{mine.length ? `${mine.length} alias` : "inga alias"}</span>
                  </button>
                  {open === c.id && (
                    <>
                      {mine.map((a) => (
                        <div key={a.id} className="par-row">
                          <span className="grow">{a.alias}</span>
                          {confirmId === a.id ? (
                            <>
                              <button className="btn small danger" type="button" disabled={busy} onClick={() => promote(a)}>Gör till kortets namn</button>
                              <button className="btn small ghost" type="button" onClick={() => setConfirmId(null)}>Avbryt</button>
                            </>
                          ) : (
                            <>
                              <button className="btn small" type="button" disabled={busy} onClick={() => setConfirmId(a.id)}>Gör till namn</button>
                              <button className="btn small ghost danger" type="button" disabled={busy} onClick={() => remove(a)}>Ta bort</button>
                            </>
                          )}
                        </div>
                      ))}
                      <div className="row">
                        <input className="t-input grow" maxLength={120} placeholder="Nytt alias, till exempel spelarens namn" aria-label="Nytt alias" value={nv} onChange={(e) => setNv(e.target.value)} />
                        <button className="btn primary small" type="button" disabled={busy || nv.trim().length < 1} onClick={() => add(c)}>Lägg till</button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </>
        )}
      </section>
    </div>
  );
}
