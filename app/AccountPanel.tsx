"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import "./panels.css";
import "./legal.css";

// Your account: download everything stored about you, or delete the account (GDPR rights of access and erasure).
export default function AccountPanel({ supabase, email, isAdmin, onClose, say }: { supabase: SupabaseClient; email: string; isAdmin: boolean; onClose: () => void; say: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");

  const download = async () => {
    setBusy(true);
    setErr("");
    const { data, error } = await supabase.rpc("export_my_data");
    setBusy(false);
    if (error || !data) return setErr("Det gick inte att hämta dina uppgifter just nu.");
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "setlistan-mina-uppgifter.json";
    a.click();
    URL.revokeObjectURL(url);
    say("Dina uppgifter är nedladdade");
  };

  const remove = async () => {
    setBusy(true);
    setErr("");
    const { error } = await supabase.rpc("delete_my_account");
    if (error) {
      setBusy(false);
      return setErr("Kontot kunde inte tas bort just nu. Försök igen eller mejla oss.");
    }
    await supabase.auth.signOut();
    location.href = "/?konto=borttaget";
  };

  return (
    <section className="panel auth" aria-label="Konto">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3>Konto</h3>
        <button className="btn small ghost" type="button" onClick={onClose}>Stäng</button>
      </div>
      <div className="note">Inloggad som {email}</div>

      <div className="label">Dina uppgifter</div>
      <div className="note">Ladda ner allt vi har sparat om dig (samling, favoriter, feedback med mera) som en fil.</div>
      <div className="row">
        <button className="btn" type="button" disabled={busy} onClick={download}>Ladda ner mina uppgifter</button>
      </div>

      <div className="label">Ta bort kontot</div>
      {isAdmin ? (
        <div className="note">Administratörskonton tas bort av en annan superuser. Hör av dig om du vill lämna.</div>
      ) : (
        <div className="danger-zone">
          <div>Kontot och allt som hör till det raderas direkt: din samling, favoriter, feedback, förslag och eventuell väntelisteanmälan. Det går inte att ångra.</div>
          <label className="auth-form">
            <span className="label">Skriv RADERA för att bekräfta</span>
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          </label>
          <div className="row">
            <button className="btn danger" type="button" disabled={busy || confirm.trim().toUpperCase() !== "RADERA"} onClick={remove}>Ta bort mitt konto för gott</button>
          </div>
        </div>
      )}
      {err && <div className="note warn">{err}</div>}

      <div className="site-foot">
        <a href="/integritet">Integritetspolicy</a>
        <a href="/villkor">Användarvillkor</a>
      </div>
    </section>
  );
}
