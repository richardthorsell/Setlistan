"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import "./panels.css";
import "./legal.css";
import { useT } from "@/lib/i18n";

// Your account: download everything stored about you, or delete the account (GDPR rights of access and erasure).
export default function AccountPanel({ supabase, email, isAdmin, onClose, say }: { supabase: SupabaseClient; email: string; isAdmin: boolean; onClose: () => void; say: (m: string) => void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");

  const download = async () => {
    setBusy(true);
    setErr("");
    const { data, error } = await supabase.rpc("export_my_data");
    setBusy(false);
    if (error || !data) return setErr(t("Det gick inte att hämta dina uppgifter just nu."));
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "setlistan-mina-uppgifter.json";
    a.click();
    URL.revokeObjectURL(url);
    say(t("Dina uppgifter är nedladdade"));
  };

  const remove = async () => {
    setBusy(true);
    setErr("");
    const { error } = await supabase.rpc("delete_my_account");
    if (error) {
      setBusy(false);
      return setErr(t("Kontot kunde inte tas bort just nu. Försök igen eller mejla oss."));
    }
    await supabase.auth.signOut();
    location.href = "/?konto=borttaget";
  };

  return (
    <section className="panel auth" aria-label={t("Konto")}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3>{t("Konto")}</h3>
        <button className="btn small ghost" type="button" onClick={onClose}>{t("Stäng")}</button>
      </div>
      <div className="note">{t("Inloggad som")}{" "}{email}</div>

      <div className="label">{t("Dina uppgifter")}</div>
      <div className="note">{t("Ladda ner allt vi har sparat om dig (samling, favoriter, feedback med mera) som en fil.")}</div>
      <div className="row">
        <button className="btn" type="button" disabled={busy} onClick={download}>{t("Ladda ner mina uppgifter")}</button>
      </div>

      <div className="label">{t("Ta bort kontot")}</div>
      {isAdmin ? (
        <div className="note">{t("Administratörskonton tas bort av en annan superuser. Hör av dig om du vill lämna.")}</div>
      ) : (
        <div className="danger-zone">
          <div>{t("Kontot och allt som hör till det raderas direkt: din samling, favoriter, feedback, förslag och eventuell väntelisteanmälan. Det går inte att ångra.")}</div>
          <label className="auth-form">
            <span className="label">{t("Skriv RADERA för att bekräfta")}</span>
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          </label>
          <div className="row">
            <button className="btn danger" type="button" disabled={busy || confirm.trim().toUpperCase() !== "RADERA"} onClick={remove}>{t("Ta bort mitt konto för gott")}</button>
          </div>
        </div>
      )}
      {err && <div className="note warn">{err}</div>}

      <div className="site-foot">
        <a href="/integritet">{t("Integritetspolicy")}</a>
        <a href="/villkor">{t("Användarvillkor")}</a>
      </div>
    </section>
  );
}
