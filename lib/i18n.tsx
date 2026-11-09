"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { EN } from "./en";

// Swedish is the source language; every Swedish text is wrapped in t("…") and looked up in EN when English is chosen.
export type Lang = "sv" | "en";

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: "sv", setLang: () => {} });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("sv");

  // The saved choice wins; otherwise Swedish for Swedish browsers and English for everyone else.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("lang");
      if (saved === "sv" || saved === "en") return setLangState(saved);
    } catch {}
    if (!/^sv\b/i.test(navigator.language || "sv")) setLangState("en");
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem("lang", l);
    } catch {}
  }, []);

  return <Ctx.Provider value={{ lang, setLang }}>{children}</Ctx.Provider>;
}

export const useLang = () => useContext(Ctx);

export function useT() {
  const { lang } = useContext(Ctx);
  return (sv: string) => (lang === "en" ? EN[sv] ?? sv : sv);
}

export function LangSwitch() {
  const { lang, setLang } = useLang();
  return (
    <div className="langtoggle" role="group" aria-label="Språk / Language">
      <button type="button" lang="sv" title="Svenska" aria-label="Byt till svenska" aria-pressed={lang !== "en"} onClick={() => setLang("sv")}>SV</button>
      <button type="button" lang="en" title="English" aria-label="Switch to English" aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
    </div>
  );
}
