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
  const next: Lang = lang === "en" ? "sv" : "en";
  return (
    <button className="btn small ghost" type="button" lang={next} aria-label={next === "en" ? "Switch to English" : "Byt till svenska"} onClick={() => setLang(next)}>
      {next === "en" ? "English" : "Svenska"}
    </button>
  );
}
