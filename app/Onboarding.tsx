"use client";

import { useEffect, useState } from "react";
import { MockMissing, MockSearch, MockSet, MockTick, MockTradera } from "./Visuals";
import "./panels.css";
import "./landing.css";
import { useLang, useT } from "@/lib/i18n";

export type Update = { id: string; title: string; body: string; created_at: string };

const when = (iso: string, lang: string) => new Date(iso).toLocaleDateString(lang === "en" ? "en-GB" : "sv-SE", { year: "numeric", month: "short", day: "numeric" });

// First-run guide, shown once after the first sign-in.
export function Welcome({ onDone }: { onDone: () => void }) {
  const t = useT();
  const STEPS = [
    { t: t("Välkommen till Setlistan"), d: t("Här söker du fram checklistor för samlarkort, prickar av korten du har och ser direkt vilka som saknas. Vi visar dig runt på en minut."), v: <MockSet /> },
    { t: t("Hitta ett set"), d: t("Öppna albumlistan under Biblioteket och sök, till exempel efter Topps Premier League Flagship 26/27. Saknas setet kan du föreslå det så lägger vi in det."), v: <MockSearch /> },
    { t: t("Pricka av dina kort"), d: t("Tryck på ett kort för att markera att du har det. Välj parallell (/50, /25 och fler) och skriv in serienummer. Du kan också skriva nummer i snabbmarkeringsrutan för att pricka av många på en gång."), v: <MockTick /> },
    { t: t("Saknade kort"), d: t("Filtrera på Saknas och exportera listan, så vet du precis vad du letar efter."), v: <MockMissing /> },
    { t: t("Vad är det värt?"), d: t("Tryck på T vid ett kort för att se vad liknande kort har sålts för på Tradera. Under Nytt ser du alltid vad som har ändrats i Setlistan."), v: <MockTradera /> },
  ];
  const TONES = ["var(--accent)", "var(--have)", "#E0559A", "var(--rc)", "#2F7FE0"];
  const [i, setI] = useState(0);
  const last = i === STEPS.length - 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone();
      if (e.key === "ArrowRight") setI((v) => Math.min(v + 1, 4));
      if (e.key === "ArrowLeft") setI((v) => Math.max(v - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone]);

  return (
    <div className="ob-backdrop">
      <section className="ob" style={{ ["--tone" as string]: TONES[i] } as React.CSSProperties} role="dialog" aria-modal="true" aria-label={t("Introduktion")}>
        <div className="ob-art">
          <span className="ob-step mono" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
          <div className="ob-visual" key={i}>{STEPS[i].v}</div>
        </div>
        <div className="ob-body">
          <div className="ob-top">
            <span className="label">{t("Steg")}{" "}{i + 1} {t("av")} {STEPS.length}</span>
            <button className="btn small ghost" type="button" onClick={onDone}>{t("Hoppa över")}</button>
          </div>
          <div className="ob-bar" aria-hidden="true"><i style={{ width: `${((i + 1) / STEPS.length) * 100}%` }} /></div>
          <div className="ob-copy" key={"c" + i}>
            <h3>{STEPS[i].t}</h3>
            <p>{STEPS[i].d}</p>
          </div>
          <div className="ob-nav">
            <div className="dots" aria-hidden="true">{STEPS.map((_, k) => <i key={k} className={k === i ? "on" : ""} />)}</div>
            <div className="row">
              {i > 0 && <button className="btn" type="button" onClick={() => setI(i - 1)}>{t("Tillbaka")}</button>}
              <button className="btn primary big" type="button" onClick={() => (last ? onDone() : setI(i + 1))}>{last ? t("Börja använda Setlistan") : t("Nästa")}</button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// What's new: updates posted by the admins. `since` marks the ones the user has not seen yet.
export function WhatsNew({ updates, since, onClose }: { updates: Update[]; since: string | null; onClose: () => void }) {
  const t = useT();
  const { lang } = useLang();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="t-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="panel tradera" role="dialog" aria-modal="true" aria-label={t("Nytt i Setlistan")}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3>{t("Nytt i Setlistan")}</h3>
          <button className="btn small ghost" type="button" onClick={onClose}>{t("Stäng")}</button>
        </div>
        {updates.length ? (
          <div className="news-list">
            {updates.map((u) => (
              <div key={u.id} className={`news-item ${since === null || u.created_at > since ? "fresh" : ""}`}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <b>{u.title}</b>
                  <span className="note mono">{when(u.created_at, lang)}</span>
                </div>
                <p>{u.body}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="note">{t("Inga uppdateringar än.")}</div>
        )}
      </section>
    </div>
  );
}
