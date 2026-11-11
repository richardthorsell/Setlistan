"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import AuthBox from "./AuthBox";
import Image from "next/image";
import logoWide from "@/Logo-banner.png";
import logoMark from "@/Logo-ikon.png";
import { WaitlistBox } from "./BetaPanels";
import { MockMissing, MockTick, MockTradera } from "./Visuals";
import { MockFind, MockOverview, MockPlayer, MockSell } from "./LandingVisuals";
import { SiteFooter } from "./LegalPage";
import "./panels.css";
import "./landing.css";
import { LangSwitch, localeOf, useLang, useT } from "@/lib/i18n";

// Front page for visitors. The service itself is behind sign-in and invite-only during the beta.
export default function Landing({ supabase, message }: { supabase: SupabaseClient; message: string | null }) {
  const t = useT();
  const { lang } = useLang();
  const [panel, setPanel] = useState<"wait" | "login" | "invite" | null>(null);
  const [stats, setStats] = useState<{ sets: number; cards: number } | null>(null);

  // How much the library holds, counted by the database.
  useEffect(() => {
    let live = true;
    supabase.rpc("public_stats").then(({ data }) => {
      const d = data as { sets?: number; cards?: number } | null;
      if (live && d && typeof d.sets === "number" && typeof d.cards === "number") setStats({ sets: d.sets, cards: d.cards });
    });
    return () => {
      live = false;
    };
  }, [supabase]);

  const loc = localeOf(lang);
  const facts: [string, string][] = [
    ...(stats
      ? ([
          [stats.sets.toLocaleString(loc), t("set")],
          [(Math.floor(stats.cards / 100000) / 10).toLocaleString(loc, { minimumFractionDigits: 1 }), t("miljoner kort")],
        ] as [string, string][])
      : []),
    ["8", t("språk")],
    [t("Gratis"), t("under betan")],
  ];

  const FEATURES = [
    { t: t("Hitta set och spelare"), d: t("Sök på ett set, till exempel Topps Premier League Flagship 26/27, eller på en spelare och se alla hans kort i alla set. Finns inte setet kan du föreslå det så lägger vi in det."), v: <MockFind /> },
    { t: t("Pricka av det du har"), d: t("Tryck på korten du äger. Paralleller som /50 och /25 och serienummer hålls isär."), v: <MockTick /> },
    { t: t("Följ dina spelare"), d: t("Följ spelarna du samlar på. Du får en egen lista med alla deras kort och ser hur långt du har kommit."), v: <MockPlayer /> },
    { t: t("Se vad som saknas"), d: t("Filtrera på det du saknar, exportera listan och ta med den till kortmässan."), v: <MockMissing /> },
    { t: t("Sälj med färdig säljtråd"), d: t("Markera dubbletterna och få en färdig tråd för Facebook-grupper, med lots och priser. Kopiera och lägg in dina bilder."), v: <MockSell /> },
    { t: t("Vad är det värt?"), d: t("Se vad liknande kort faktiskt har sålts för på Tradera, direkt från kortet."), v: <MockTradera /> },
  ];
  const ALSO = [t("Paralleller och serienummer"), t("Önskelista"), t("Dubbletter"), t("Dela listor med en länk"), t("Åtta språk"), t("Fungerar i mobilen")];

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
          <h2 className="hero-title" lang="en">The easiest way to complete your collection</h2>
          <p className="lead">{t("Sök fram ett set eller en spelare, pricka av korten du har och se direkt vad som saknas. Sälj dubbletterna med en färdig säljtråd.")}</p>
          <div className="row">
            <button className="btn primary big" type="button" onClick={() => setPanel("wait")}>{t("Gå med i väntelistan")}</button>
            <button className="btn big" type="button" onClick={() => setPanel("invite")}>{t("Jag har en inbjudan")}</button>
          </div>
          <div className="note">{t("Setlistan är i beta och öppnas för inbjudna i omgångar.")}</div>
        </header>
        <MockOverview />
      </div>

      {message && <div className="note warn">{message}</div>}
      {panel === "wait" && <WaitlistBox onClose={() => setPanel(null)} />}
      {(panel === "login" || panel === "invite") && <AuthBox supabase={supabase} initialMode={panel === "invite" ? "signup" : "login"} onClose={() => setPanel(null)} />}

      <section className="stats" aria-label={t("Biblioteket i siffror")}>
        {facts.map(([n, l]) => (
          <div key={l} className="stat">
            <b>{n}</b>
            <span>{l}</span>
          </div>
        ))}
      </section>

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

      <section className="also" aria-label={t("Och dessutom")}>
        {ALSO.map((a) => (
          <span key={a} className="mk-chip">{a}</span>
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
