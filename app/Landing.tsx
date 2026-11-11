"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import AuthBox from "./AuthBox";
import Image from "next/image";
import logoWide from "@/Futuristisk Setlistan.se Collector-banner-1.png";
import logoMark from "@/Glödande blå S-loop med svepande bågar-2.png";
import { WaitlistBox } from "./BetaPanels";
import { MockMissing, MockSearch, MockSet, MockTick, MockTradera } from "./Visuals";
import { SiteFooter } from "./LegalPage";
import "./panels.css";
import "./landing.css";
import { LangSwitch, useT } from "@/lib/i18n";

// Front page for visitors. The service itself is behind sign-in and invite-only during the beta.
export default function Landing({ supabase, message }: { supabase: SupabaseClient; message: string | null }) {
  const t = useT();
  const FEATURES = [
    { t: t("Hitta checklistan"), d: t("Sök på ett set, till exempel Topps Premier League Flagship 26/27. Finns det inte kan du föreslå det så lägger vi in det."), v: <MockSearch /> },
    { t: t("Pricka av det du har"), d: t("Tryck på korten du äger. Paralleller som /50 och /25 och serienummer hålls isär."), v: <MockTick /> },
    { t: t("Se vad som saknas"), d: t("Filtrera på det du saknar, exportera listan och ta med den till kortmässan."), v: <MockMissing /> },
    { t: t("Vad är det värt?"), d: t("Se vad liknande kort faktiskt har sålts för på Tradera, direkt från kortet."), v: <MockTradera /> },
  ];
  const [panel, setPanel] = useState<"wait" | "login" | "invite" | null>(null);

  return (
    <div className="wrap landing">
      <div className="topbar">
        <Image className="topmark" src={logoMark} alt="Setlistan" width={40} height={40} />
        <div className="account">
          <LangSwitch /><span className="pill">{t("Beta")}</span>
          <button className="btn small" type="button" onClick={() => setPanel("login")}>{t("Logga in")}</button>
        </div>
      </div>

      <div className="hero-grid">
        <header className="hero">
          <h1 className="logo-h1"><Image src={logoWide} alt="Setlistan.se Collector" priority sizes="(max-width: 640px) 90vw, 600px" /></h1>
          <p className="lead">{t("Sök fram en checklista, pricka av korten du har och se direkt vilka som fattas.")}</p>
          <div className="row">
            <button className="btn primary big" type="button" onClick={() => setPanel("wait")}>{t("Gå med i väntelistan")}</button>
            <button className="btn big" type="button" onClick={() => setPanel("invite")}>{t("Jag har en inbjudan")}</button>
          </div>
          <div className="note">{t("Setlistan är i beta och öppnas för inbjudna i omgångar.")}</div>
        </header>
        <MockSet />
      </div>

      {message && <div className="note warn">{message}</div>}
      {panel === "wait" && <WaitlistBox onClose={() => setPanel(null)} />}
      {(panel === "login" || panel === "invite") && <AuthBox supabase={supabase} initialMode={panel === "invite" ? "signup" : "login"} onClose={() => setPanel(null)} />}

      <section className="features" aria-label={t("Det här kan du göra")}>
        {FEATURES.map((f, i) => (
          <div key={f.t} className="feature">
            <span className="mono step">{i + 1}</span>
            <h3>{f.t}</h3>
            <p>{f.d}</p>
            {f.v}
          </div>
        ))}
      </section>

      <section className="panel auth" aria-label={t("Väntelista")}>
        <h3>{t("Vill du vara med?")}</h3>
        <div className="note">{t("Anmäl dig till väntelistan så bjuder vi in dig när det finns plats.")}</div>
        <div className="row">
          <button className="btn primary" type="button" onClick={() => { setPanel("wait"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{t("Gå med i väntelistan")}</button>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
