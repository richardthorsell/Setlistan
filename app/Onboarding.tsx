"use client";

import { useEffect, useState } from "react";
import "./panels.css";
import "./landing.css";

export type Update = { id: string; title: string; body: string; created_at: string };

const STEPS = [
  { t: "Välkommen till Setlistan", d: "Här söker du fram checklistor för samlarkort, prickar av korten du har och ser direkt vilka som saknas. Vi visar dig runt på en minut." },
  { t: "Hitta ett set", d: "Skriv till exempel Topps Premier League Flagship 26/27 i sökrutan. Finns setet i biblioteket öppnas det direkt. Annars trycker du Hämta så letar vi upp listan åt dig. Hämtningar är begränsade per dygn." },
  { t: "Pricka av dina kort", d: "Tryck på ett kort för att markera att du har det. Välj parallell (/50, /25 och fler) och skriv in serienummer. Du kan också klistra in en lista för att pricka av många på en gång." },
  { t: "Saknade kort och värde", d: "Filtrera på Saknas och exportera listan. Tryck på T vid ett kort för att se vad liknande kort har sålts för på Tradera. Under Nytt ser du alltid vad som har ändrats." },
];

const when = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric" });

// First-run guide, shown once after the first sign-in.
export function Welcome({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const last = i === STEPS.length - 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone]);

  return (
    <div className="t-backdrop">
      <section className="panel tradera" role="dialog" aria-modal="true" aria-label="Introduktion">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="label">Steg {i + 1} av {STEPS.length}</span>
          <button className="btn small ghost" type="button" onClick={onDone}>Hoppa över</button>
        </div>
        <h3 style={{ fontSize: 34 }}>{STEPS[i].t}</h3>
        <p style={{ margin: 0 }}>{STEPS[i].d}</p>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="dots" aria-hidden="true">{STEPS.map((_, k) => <i key={k} className={k === i ? "on" : ""} />)}</div>
          <div className="row">
            {i > 0 && <button className="btn" type="button" onClick={() => setI(i - 1)}>Tillbaka</button>}
            <button className="btn primary" type="button" onClick={() => (last ? onDone() : setI(i + 1))}>{last ? "Börja använda Setlistan" : "Nästa"}</button>
          </div>
        </div>
      </section>
    </div>
  );
}

// What's new: updates posted by the admins. `since` marks the ones the user has not seen yet.
export function WhatsNew({ updates, since, onClose }: { updates: Update[]; since: string | null; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="t-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="panel tradera" role="dialog" aria-modal="true" aria-label="Nytt i Setlistan">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3>Nytt i Setlistan</h3>
          <button className="btn small ghost" type="button" onClick={onClose}>Stäng</button>
        </div>
        {updates.length ? (
          <div className="news-list">
            {updates.map((u) => (
              <div key={u.id} className={`news-item ${since === null || u.created_at > since ? "fresh" : ""}`}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <b>{u.title}</b>
                  <span className="note mono">{when(u.created_at)}</span>
                </div>
                <p>{u.body}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="note">Inga uppdateringar än.</div>
        )}
      </section>
    </div>
  );
}
