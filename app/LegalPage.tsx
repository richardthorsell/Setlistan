"use client";

import type { ReactNode } from "react";
import { LEGAL } from "@/lib/legal";
import "./legal.css";
import { LangSwitch, useT } from "@/lib/i18n";

export function SiteFooter() {
  const t = useT();
  return (
    <nav className="site-foot" aria-label={t("Juridisk information")}>
      <a href="/integritet">{t("Integritet")}</a>
      <a href="/villkor">{t("Villkor")}</a>
      {LEGAL.contactEmail && <a href={`mailto:${LEGAL.contactEmail}`}>{t("Kontakt")}</a>}
    </nav>
  );
}

export default function LegalPage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  const t = useT();
  return (
    <main className="legal">
      <div className="legal-top">
        <a href="/">← {LEGAL.service}</a>
        <span className="label"><LangSwitch /> {t("Senast uppdaterad")}{" "}{LEGAL.updated}</span>
      </div>
      <h1>{title}</h1>
      <p className="lead">{intro}</p>
      {children}
      <div className="legal-foot">
        <a href="/integritet">{t("Integritetspolicy")}</a>
        <a href="/villkor">{t("Användarvillkor")}</a>
        {LEGAL.contactEmail && <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>}
      </div>
    </main>
  );
}
