"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import AuthBox from "./AuthBox";
import { WaitlistBox } from "./BetaPanels";
import { MockMissing, MockSearch, MockSet, MockTick, MockTradera } from "./Visuals";
import "./panels.css";
import "./landing.css";

const FEATURES = [
  { t: "Hitta checklistan", d: "Sök på ett set, till exempel Topps Premier League Flagship 26/27. Finns det inte hämtar vi listan åt dig.", v: <MockSearch /> },
  { t: "Pricka av det du har", d: "Tryck på korten du äger. Paralleller som /50 och /25 och serienummer hålls isär.", v: <MockTick /> },
  { t: "Se vad som saknas", d: "Filtrera på det du saknar, exportera listan och ta med den till kortmässan.", v: <MockMissing /> },
  { t: "Vad är det värt?", d: "Se vad liknande kort faktiskt har sålts för på Tradera, direkt från kortet.", v: <MockTradera /> },
];

// Front page for visitors. The service itself is behind sign-in and invite-only during the beta.
export default function Landing({ supabase, message }: { supabase: SupabaseClient; message: string | null }) {
  const [panel, setPanel] = useState<"wait" | "login" | null>(null);

  return (
    <div className="wrap landing">
      <div className="topbar">
        <span className="label">Samlarkort · checklistor</span>
        <div className="account">
          <span className="pill">Beta</span>
          <button className="btn small" type="button" onClick={() => setPanel("login")}>Logga in</button>
        </div>
      </div>

      <div className="hero-grid">
        <header className="hero">
          <h1>Setlistan</h1>
          <p className="lead">Sök fram en checklista, pricka av korten du har och se direkt vilka som fattas.</p>
          <div className="row">
            <button className="btn primary big" type="button" onClick={() => setPanel("wait")}>Gå med i väntelistan</button>
            <button className="btn big" type="button" onClick={() => setPanel("login")}>Jag har en inbjudan</button>
          </div>
          <div className="note">Setlistan är i beta och öppnas för inbjudna i omgångar.</div>
        </header>
        <MockSet />
      </div>

      {message && <div className="note warn">{message}</div>}
      {panel === "wait" && <WaitlistBox onClose={() => setPanel(null)} />}
      {panel === "login" && <AuthBox supabase={supabase} onClose={() => setPanel(null)} />}

      <section className="features" aria-label="Det här kan du göra">
        {FEATURES.map((f, i) => (
          <div key={f.t} className="feature">
            <span className="mono step">{i + 1}</span>
            <h3>{f.t}</h3>
            <p>{f.d}</p>
            {f.v}
          </div>
        ))}
      </section>

      <section className="panel auth" aria-label="Väntelista">
        <h3>Vill du vara med?</h3>
        <div className="note">Anmäl dig till väntelistan så bjuder vi in dig när det finns plats.</div>
        <div className="row">
          <button className="btn primary" type="button" onClick={() => { setPanel("wait"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Gå med i väntelistan</button>
        </div>
      </section>
    </div>
  );
}
