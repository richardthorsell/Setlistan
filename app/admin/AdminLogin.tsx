"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import "../panels.css";
import "./admin.css";

// Sign-in for /admin. A home-screen app keeps its own storage on an iPhone, so it needs its own sign-in; it is the same account.
export default function AdminLogin() {
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) {
      setBusy(false);
      return setErr(error.status === 429 ? "För många försök. Vänta en stund och försök igen." : "Fel e-post eller lösenord.");
    }
    window.location.reload();
  };

  return (
    <main className="admin-login">
      <form className="panel" onSubmit={submit}>
        <h3>Setlistan Admin</h3>
        <div className="note">Logga in med samma e-post och lösenord som i Setlistan.</div>
        <input type="email" required autoComplete="username" placeholder="E-post" aria-label="E-post" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type="password" required autoComplete="current-password" placeholder="Lösenord" aria-label="Lösenord" value={password} onChange={(e) => setPassword(e.target.value)} />
        {err && <div className="note warn" role="alert">{err}</div>}
        <div className="row">
          <button className="btn primary" type="submit" disabled={busy}>Logga in</button>
          <a className="btn ghost" href="/">Till Setlistan</a>
        </div>
      </form>
    </main>
  );
}
