"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import "./panels.css";
import { useT } from "@/lib/i18n";

type Mode = "login" | "signup" | "link";

// Sign-in panel: password (sign in / create account) or a one-time link by e-mail.
export default function AuthBox({ supabase, onClose, initialMode }: { supabase: SupabaseClient; onClose: () => void; initialMode?: Mode }) {
  const t = useT();
  // Two questions: what do you want to do (step 1), and how (step 2). A button that already says what you want skips step 1.
  const [intent, setIntent] = useState<"login" | "signup" | null>(initialMode === "signup" ? "signup" : initialMode ? "login" : null);
  const [method, setMethod] = useState<"password" | "link">(initialMode === "link" ? "link" : "password");
  const mode: Mode = method === "link" ? "link" : intent === "signup" ? "signup" : "login";
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
        setMsg({ t: t("Vi har skickat en inloggningslänk. Öppna mejlet och klicka på länken.") });
      } else if (mode === "signup") {
        if (password.length < 8) {
          setMsg({ t: t("Lösenordet behöver minst 8 tecken."), warn: true });
          return;
        }
        const { data, error } = await supabase.auth.signUp({ email: addr, password, options: { emailRedirectTo: redirect } });
        if (error) throw error;
        if (data.session) onClose();
        else setMsg({ t: t("Kontot är skapat. Bekräfta din e-post via länken i mejlet, sedan kan du logga in.") });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: addr, password });
        if (error) throw error;
        onClose();
      }
    } catch (err) {
      const e = err as { status?: number; code?: string; message?: string };
      const text =
        (mode !== "login" && (e.status === 500 || e.code === "unexpected_failure" || /database error|not_invited/i.test(e.message || "")))
          ? t("Den här adressen är inte inbjuden än. Anmäl dig på väntelistan så bjuder vi in dig.")
          : e.code === "invalid_credentials"
          ? t("Fel e-post eller lösenord.")
          : e.code === "email_not_confirmed"
            ? t("Bekräfta din e-post först via länken i mejlet.")
            : e.code === "user_already_exists"
              ? t("Det finns redan ett konto med den adressen. Logga in i stället.")
              : e.code === "weak_password"
                ? t("Lösenordet är för svagt. Välj ett längre.")
                : e.status === 429
                  ? t("För många försök. Vänta en stund och försök igen.")
                  : t("Det gick inte. Kontrollera uppgifterna och försök igen.");
      setMsg({ t: text, warn: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel auth" aria-label={t("Logga in")}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3>{!intent ? t("Vad vill du göra?") : intent === "signup" ? t("Skapa konto") : t("Logga in")}</h3>
        <button className="btn small ghost" type="button" onClick={onClose}>{t("Stäng")}</button>
      </div>
      {!intent ? (
        <div className="row" style={{ flexWrap: "wrap" }}>
          <button className="btn primary big" type="button" onClick={() => setIntent("login")}>{t("Logga in")}</button>
          <button className="btn big" type="button" onClick={() => setIntent("signup")}>{t("Skapa konto")}</button>
        </div>
      ) : (
        <>
          <div className="seg" role="group" aria-label={t("Sätt att logga in")}>
            <button type="button" aria-pressed={method === "password"} onClick={() => setMethod("password")}>{t("Lösenord")}</button>
            <button type="button" aria-pressed={method === "link"} onClick={() => setMethod("link")}>{t("Länk via e-post")}</button>
          </div>
          {intent === "signup" && <div className="note">{t("Betan är bara för inbjudna. Använd samma e-postadress som du anmälde till väntelistan. Genom att skapa konto godkänner du")}{" "}<a href="/villkor" target="_blank" rel="noopener noreferrer">{t("villkoren")}</a> och <a href="/integritet" target="_blank" rel="noopener noreferrer">{t("integritetspolicyn")}</a>.</div>}
          <form onSubmit={submit} className="auth-form">
            <label>
              <span className="label">{t("E-post")}</span>
              <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            {mode !== "link" && (
              <label>
                <span className="label">{t("Lösenord")}</span>
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
                {mode === "signup" ? t("Skapa konto") : mode === "link" ? t("Skicka länk") : t("Logga in")}
              </button>
              {mode === "login" && (
                <button className="btn ghost small" type="button" onClick={() => setMethod("link")}>{t("Glömt lösenordet? Logga in med länk")}</button>
              )}
            </div>
          </form>
          <button className="btn small ghost" type="button" onClick={() => setIntent(intent === "signup" ? "login" : "signup")}>
            {intent === "signup" ? t("Har du redan ett konto? Logga in") : t("Inget konto än? Skapa konto")}
          </button>
        </>
      )}
      {msg && <div className={`note ${msg.warn ? "warn" : ""}`}>{msg.t}</div>}
    </section>
  );
}
