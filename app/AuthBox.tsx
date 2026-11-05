"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import "./panels.css";

type Mode = "login" | "signup" | "link";

// Sign-in panel: password (sign in / create account) or a one-time link by e-mail.
export default function AuthBox({ supabase, onClose }: { supabase: SupabaseClient; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; warn?: boolean } | null>(null);
  const redirect = typeof location !== "undefined" ? `${location.origin}/auth/callback` : undefined;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const addr = email.trim().toLowerCase();
    try {
      if (mode === "link") {
        const { error } = await supabase.auth.signInWithOtp({ email: addr, options: { emailRedirectTo: redirect } });
        if (error) throw error;
        setMsg({ t: "Vi har skickat en inloggningslänk. Öppna mejlet och klicka på länken." });
      } else if (mode === "signup") {
        if (password.length < 8) {
          setMsg({ t: "Lösenordet behöver minst 8 tecken.", warn: true });
          return;
        }
        const { data, error } = await supabase.auth.signUp({ email: addr, password, options: { emailRedirectTo: redirect } });
        if (error) throw error;
        if (data.session) onClose();
        else setMsg({ t: "Kontot är skapat. Bekräfta din e-post via länken i mejlet, sedan kan du logga in." });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: addr, password });
        if (error) throw error;
        onClose();
      }
    } catch (err) {
      const e = err as { status?: number; code?: string; message?: string };
      const t =
        (mode !== "login" && (e.status === 500 || e.code === "unexpected_failure" || /database error|not_invited/i.test(e.message || "")))
          ? "Den här adressen är inte inbjuden än. Anmäl dig på väntelistan så bjuder vi in dig."
          : e.code === "invalid_credentials"
          ? "Fel e-post eller lösenord."
          : e.code === "email_not_confirmed"
            ? "Bekräfta din e-post först via länken i mejlet."
            : e.code === "user_already_exists"
              ? "Det finns redan ett konto med den adressen. Logga in i stället."
              : e.code === "weak_password"
                ? "Lösenordet är för svagt. Välj ett längre."
                : e.status === 429
                  ? "För många försök. Vänta en stund och försök igen."
                  : "Det gick inte. Kontrollera uppgifterna och försök igen.";
      setMsg({ t, warn: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel auth" aria-label="Logga in">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3>{mode === "signup" ? "Skapa konto" : "Logga in"}</h3>
        <button className="btn small ghost" type="button" onClick={onClose}>Stäng</button>
      </div>
      <div className="seg" role="group" aria-label="Sätt att logga in">
        <button type="button" aria-pressed={mode === "login"} onClick={() => setMode("login")}>Lösenord</button>
        <button type="button" aria-pressed={mode === "signup"} onClick={() => setMode("signup")}>Nytt konto</button>
        <button type="button" aria-pressed={mode === "link"} onClick={() => setMode("link")}>Länk via e-post</button>
      </div>
      {mode !== "login" && <div className="note">Betan är bara för inbjudna. Använd samma e-postadress som du anmälde till väntelistan. Genom att skapa konto godkänner du <a href="/villkor" target="_blank" rel="noopener noreferrer">villkoren</a> och <a href="/integritet" target="_blank" rel="noopener noreferrer">integritetspolicyn</a>.</div>}
      <form onSubmit={submit} className="auth-form">
        <label>
          <span className="label">E-post</span>
          <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {mode !== "link" && (
          <label>
            <span className="label">Lösenord</span>
            <input
              type="password"
              required
              minLength={mode === "signup" ? 8 : undefined}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}
        <div className="row">
          <button className="btn primary" type="submit" disabled={busy}>
            {mode === "signup" ? "Skapa konto" : mode === "link" ? "Skicka länk" : "Logga in"}
          </button>
          {mode === "login" && (
            <button className="btn ghost small" type="button" onClick={() => setMode("link")}>Glömt lösenordet? Logga in med länk</button>
          )}
        </div>
      </form>
      {msg && <div className={`note ${msg.warn ? "warn" : ""}`}>{msg.t}</div>}
    </section>
  );
}
