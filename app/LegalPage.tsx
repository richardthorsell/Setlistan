import type { ReactNode } from "react";
import { LEGAL } from "@/lib/legal";
import "./legal.css";

export function SiteFooter() {
  return (
    <nav className="site-foot" aria-label="Juridisk information">
      <a href="/integritet">Integritet</a>
      <a href="/villkor">Villkor</a>
      <a href={`mailto:${LEGAL.contactEmail}`}>Kontakt</a>
    </nav>
  );
}

export default function LegalPage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <main className="legal">
      <div className="legal-top">
        <a href="/">← {LEGAL.service}</a>
        <span className="label">Senast uppdaterad {LEGAL.updated}</span>
      </div>
      <h1>{title}</h1>
      <p className="lead">{intro}</p>
      {children}
      <div className="legal-foot">
        <a href="/integritet">Integritetspolicy</a>
        <a href="/villkor">Användarvillkor</a>
        <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>
      </div>
    </main>
  );
}
