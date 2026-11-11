"use client";

import "./landing.css";
import { useT } from "@/lib/i18n";

// Illustrations for the front page, built from plain markup. The content is made up and marked as an example.

function Frame({ children, label = "Exempel" }: { children: React.ReactNode; label?: string }) {
  const t = useT();
  return (
    <div className="mk" aria-hidden="true">
      <span className="mk-tag">{t(label)}</span>
      {children}
    </div>
  );
}

// The start page overview: search and the four tiles.
export function MockOverview() {
  const t = useT();
  const pct = (n: number) => `${n} % ${t("av korten")}`;
  return (
    <Frame>
      <div className="mk-search">
        <span>{t("Sök spelare eller set")}</span>
        <b>{t("Sök")}</b>
      </div>
      <div className="mk-tiles">
        <div className="mk-tile"><span className="mk-lab">{t("Mina set")}</span><span className="mk-big">12</span><span className="mk-sub">{pct(34)}</span></div>
        <div className="mk-tile"><span className="mk-lab">{t("Mina spelare")}</span><span className="mk-big">3</span><span className="mk-sub">{pct(58)}</span></div>
        <div className="mk-tile"><span className="mk-lab">{t("Till salu")}</span><span className="mk-big">18</span><span className="mk-sub">450 kr · 6 {t("Dubbletter").toLowerCase()}</span></div>
        <div className="mk-tile"><span className="mk-lab">{t("Önskelista")}</span><span className="mk-big">7</span><span className="mk-sub">2 {t("Hög").toLowerCase()}</span></div>
      </div>
    </Frame>
  );
}

// One search that finds sets and players, side by side.
export function MockFind() {
  const t = useT();
  return (
    <Frame>
      <div className="mk-search">
        <span>park</span>
        <b>{t("Sök")}</b>
      </div>
      <div className="mk-cols">
        <div className="mk-col">
          <span className="mk-colh">{t("Set")} (39)</span>
          <div className="mk-result"><b>Upper Deck Parkhurst 1993-94</b></div>
          <div className="mk-result"><b>Parkhurst International 1995-96</b></div>
        </div>
        <div className="mk-col">
          <span className="mk-colh">{t("Spelare")} (100+)</span>
          <div className="mk-result"><b>Brad Park</b><span className="mono">188 {t("baskort")}</span></div>
          <div className="mk-result"><b>Scott Parker</b><span className="mono">84 {t("baskort")}</span></div>
        </div>
      </div>
    </Frame>
  );
}

// A followed player with progress over all sets.
export function MockPlayer() {
  const t = useT();
  return (
    <Frame>
      <div className="mk-head">
        <b>Exempel Spelare</b>
        <span className="mono">★ {t("Följer")}</span>
      </div>
      <div className="mk-bar"><i style={{ width: "34%" }} /></div>
      <div className="mk-rows">
        <div className="mk-row"><span className="mono">✓</span><span>Upper Deck Allure 2022-23</span><span className="mk-par mono">3/5</span></div>
        <div className="mk-row"><span className="mono">✓</span><span>Upper Deck AHL 2024-25</span><span className="mk-par mono">2/2</span></div>
        <div className="mk-row"><span className="mono">○</span><span>Sportzoo SHL 2026-27</span><span className="mk-par mono">0/1</span></div>
      </div>
      <div className="mk-foot">34 % {t("av korten")}</div>
    </Frame>
  );
}

// A ready-made sales thread for a Facebook group.
export function MockSell() {
  const t = useT();
  return (
    <Frame>
      <div className="mk-chips">
        <span className="mk-chip">Facebook</span>
        <span className="mk-chip on">{t("Facebook-tråd")}</span>
        <span className="mk-chip">Tradera</span>
      </div>
      <div className="mk-post">{t("Samlarkort till salu")}<br />{t("Köparen står för frakten om inget annat överenskommes.")}<br />{t("Betalning via Swish.")}</div>
      <div className="mk-rows">
        <div className="mk-row"><span>Namn Efternamn #12</span><span className="mk-par mono">75 kr</span></div>
        <div className="mk-row"><span>Set X, 6 kort</span><span className="mk-par mono">3 kr/st · 15 kr</span></div>
      </div>
    </Frame>
  );
}
