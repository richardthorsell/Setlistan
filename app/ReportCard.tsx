"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useT } from "@/lib/i18n";
import { MAX_LINES, parseCardLines, summarize } from "@/lib/cardreport";

type Mine = { id: number; card_no: string | null; card_name: string | null; set_text: string | null; status: string; sets: { name: string } | { name: string }[] | null };
const STATUS: Record<string, string> = { ny: "Mottagen", granskas: "Granskas", klar: "Klar", avvisad: "Avvisad" };

// "Saknar du ett kort?": the user tells us a card is missing. In a set the set is known; on a player page the player is known and the set is typed.
// Nothing is added to the catalogue or the collection from here, the report is reviewed by an administrator.
export default function ReportCard({ supabase, setId, player, say }: { supabase: SupabaseClient; setId?: string; player?: string; say: (m: string) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [many, setMany] = useState(false);
  const [setText, setSetText] = useState("");
  const [no, setNo] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [list, setList] = useState("");
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<Mine[]>([]);

  const loadMine = useCallback(async () => {
    const { data } = await supabase.from("missing_card_reports").select("id, card_no, card_name, set_text, status, sets(name)").order("created_at", { ascending: false }).limit(8);
    setMine((data as unknown as Mine[]) || []);
  }, [supabase]);
  useEffect(() => {
    if (open) loadMine();
  }, [open, loadMine]);

  const needSet = !setId;
  const call = (n: string | null, nm: string | null, nt: string | null) =>
    supabase.rpc("card_report_submit", { p_set: setId ?? null, p_no: n ?? "", p_name: nm ?? "", p_note: nt ?? "", p_set_text: needSet ? setText : null, p_player: player ?? null });

  const done = () => {
    setNo("");
    setName("");
    setNote("");
    setList("");
    loadMine();
  };

  const sendOne = async () => {
    setBusy(true);
    const { data, error } = await call(no, name, note);
    setBusy(false);
    const r = error ? "error" : String(data);
    if (r === "ok") {
      say(t("Tack! Rapporten är skickad."));
      done();
    } else if (r === "duplicate") say(t("Du har redan rapporterat det här kortet."));
    else if (r === "limit") say(t("Du har skickat för många rapporter i dag. Försök igen i morgon."));
    else if (r === "empty") say(t("Skriv kortnummer eller namn."));
    else if (r === "no_set") say(t("Skriv vilket set kortet saknas i."));
    else say(t("Kunde inte skicka. Försök igen."));
  };

  const sendMany = async () => {
    const { lines, tooMany } = parseCardLines(list);
    if (!lines.length) return say(t("Skriv minst ett kort, en rad per kort."));
    setBusy(true);
    const results: string[] = [];
    for (const l of lines) {
      const { data, error } = await call(l.no, l.name, note);
      results.push(error ? "error" : String(data));
    }
    setBusy(false);
    const s = summarize(results);
    const parts = [`${s.ok} ${t("rapporter skickade")}`];
    if (s.duplicate) parts.push(`${s.duplicate} ${t("fanns redan")}`);
    if (s.failed) parts.push(`${s.failed} ${t("gick inte")}`);
    if (s.limit) parts.push(t("Dagens gräns är nådd."));
    if (tooMany) parts.push(`${t("Bara de första")} ${MAX_LINES} ${t("raderna skickades.")}`);
    say(parts.join(" · "));
    if (s.ok) done();
  };

  const canOne = !busy && (no.trim() || name.trim()) && (!needSet || setText.trim());
  const canMany = !busy && list.trim() && (!needSet || setText.trim());
  const setLabel = (r: Mine) => (Array.isArray(r.sets) ? r.sets[0]?.name : r.sets?.name) || r.set_text || "";

  return (
    <>
      <button className="btn ghost" type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {player ? `${t("Saknar du kort för")} ${player}?` : t("Saknar du ett kort?")}
      </button>
      {open && (
        <div className="panel" style={{ flexBasis: "100%" }}>
          <details>
            <summary>{t("Så fyller vi på katalogen")}</summary>
            <ul className="note" style={{ paddingLeft: 18, margin: "6px 0" }}>
              <li>{t("Saknas ett enstaka kort i ett set som finns: rapportera det här.")}</li>
              <li>{t("Saknas ett helt set: använd förslagsknappen när du söker efter setet på startsidan, och skriv gärna var checklistan finns.")}</li>
              <li>{t("Saknas flera kort, till exempel för en spelare du samlar: tryck på Flera kort och klistra in en rad per kort, med kortnumret först.")}</li>
              <li>{t("Vi granskar allt själva och lägger in det i katalogen. Du ser vad som hänt under Dina rapporter.")}</li>
            </ul>
          </details>

          {needSet && (
            <input type="text" className="t-input" style={{ width: "100%" }} maxLength={120} placeholder={t("Vilket set? (namn och år)")} aria-label={t("Vilket set? (namn och år)")} value={setText} onChange={(e) => setSetText(e.target.value)} />
          )}

          {!many ? (
            <>
              <div className="row" style={{ flexWrap: "wrap" }}>
                <input type="text" className="t-input" maxLength={20} placeholder={t("Kortnummer")} aria-label={t("Kortnummer")} value={no} onChange={(e) => setNo(e.target.value)} style={{ width: 120 }} />
                <input type="text" className="t-input grow" maxLength={120} placeholder={t("Namn på kortet")} aria-label={t("Namn på kortet")} value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <input type="text" className="t-input" style={{ width: "100%" }} maxLength={500} placeholder={t("Något mer vi bör veta? (valfritt)")} aria-label={t("Något mer vi bör veta? (valfritt)")} value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="row">
                <button className="btn small primary" type="button" disabled={!canOne} onClick={sendOne}>{t("Skicka")}</button>
                <button className="btn small ghost" type="button" onClick={() => setMany(true)}>{t("Flera kort")}</button>
                <button className="btn small ghost" type="button" onClick={() => setOpen(false)}>{t("Avbryt")}</button>
              </div>
            </>
          ) : (
            <>
              <div className="note">{t("En rad per kort, med kortnumret först. Till exempel: 12 Peter Forsberg")} ({t("högst")} {MAX_LINES}).</div>
              <textarea className="t-input" style={{ width: "100%", minHeight: 110 }} value={list} onChange={(e) => setList(e.target.value)} aria-label={t("Flera kort")} />
              <div className="row">
                <button className="btn small primary" type="button" disabled={!canMany} onClick={sendMany}>{t("Skicka alla")}</button>
                <button className="btn small ghost" type="button" onClick={() => setMany(false)}>{t("Ett kort")}</button>
                <button className="btn small ghost" type="button" onClick={() => setOpen(false)}>{t("Avbryt")}</button>
              </div>
            </>
          )}

          {mine.length > 0 && (
            <div>
              <div className="label">{t("Dina rapporter")}</div>
              <div className="admin-table">
                {mine.map((r) => (
                  <div key={r.id} className="admin-row">
                    <span className="grow">{setLabel(r)}: {[r.card_no, r.card_name].filter(Boolean).join(" ")}</span>
                    <span className="pill">{t(STATUS[r.status] || r.status)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
