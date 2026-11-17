"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useT } from "@/lib/i18n";

// "Saknar du ett kort?": the user tells us a card is missing from this set. Nothing is added to the catalogue or the collection from here.
export default function ReportCard({ supabase, setId, say }: { supabase: SupabaseClient; setId: string; say: (m: string) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [no, setNo] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("card_report_submit", { p_set: setId, p_no: no, p_name: name, p_note: note });
    setBusy(false);
    const r = error ? "error" : String(data);
    if (r === "ok") {
      say(t("Tack! Rapporten är skickad."));
      setOpen(false);
      setNo("");
      setName("");
      setNote("");
    } else if (r === "duplicate") say(t("Du har redan rapporterat det här kortet."));
    else if (r === "limit") say(t("Du har skickat för många rapporter i dag. Försök igen i morgon."));
    else if (r === "empty") say(t("Skriv kortnummer eller namn."));
    else say(t("Kunde inte skicka. Försök igen."));
  };

  return (
    <>
      <button className="btn ghost" type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{t("Saknar du ett kort?")}</button>
      {open && (
        <div className="panel" style={{ flexBasis: "100%" }}>
          <div className="note">{t("Berätta vilket kort som saknas i det här setet. Vi lägger inte in något i din samling, men vi granskar rapporten.")}</div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <input type="text" className="t-input" maxLength={20} placeholder={t("Kortnummer")} aria-label={t("Kortnummer")} value={no} onChange={(e) => setNo(e.target.value)} style={{ width: 120 }} />
            <input type="text" className="t-input grow" maxLength={120} placeholder={t("Namn på kortet")} aria-label={t("Namn på kortet")} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <input type="text" className="t-input" style={{ width: "100%" }} maxLength={500} placeholder={t("Något mer vi bör veta? (valfritt)")} aria-label={t("Något mer vi bör veta? (valfritt)")} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="row">
            <button className="btn small primary" type="button" disabled={busy || (!no.trim() && !name.trim())} onClick={send}>{t("Skicka")}</button>
            <button className="btn small ghost" type="button" onClick={() => setOpen(false)}>{t("Avbryt")}</button>
          </div>
        </div>
      )}
    </>
  );
}
