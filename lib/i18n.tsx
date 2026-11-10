"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { EN } from "./en";
import { EXTRA } from "./extra";
import { NOTES_EN, translateNote } from "./notes";

// Swedish is the source language; every Swedish text is wrapped in t("…") and looked up in the chosen language's dictionary.
// English is bundled; the other languages are loaded the first time they are chosen. A missing text falls back to English, then Swedish.
export const LANGS = [
  ["sv", "Svenska"],
  ["en", "English"],
  ["da", "Dansk"],
  ["no", "Norsk"],
  ["fi", "Suomi"],
  ["de", "Deutsch"],
  ["es", "Español"],
  ["it", "Italiano"],
] as const;
export type Lang = (typeof LANGS)[number][0];

const LOCALES: Record<Lang, string> = { sv: "sv-SE", en: "en-GB", da: "da-DK", no: "nb-NO", fi: "fi-FI", de: "de-DE", es: "es-ES", it: "it-IT" };
export const localeOf = (lang: Lang) => LOCALES[lang];

type Pack = { DICT: Record<string, string>; NOTES: Record<string, string> };
const LOADERS: Partial<Record<Lang, () => Promise<Pack>>> = {
  da: () => import("./lang/da"),
  no: () => import("./lang/no"),
  fi: () => import("./lang/fi"),
  de: () => import("./lang/de"),
  es: () => import("./lang/es"),
  it: () => import("./lang/it"),
};
const isLang = (v: unknown): v is Lang => LANGS.some(([c]) => c === v);

function detect(): Lang {
  const l = (navigator.language || "sv").toLowerCase();
  if (/^(nb|nn|no)\b/.test(l)) return "no";
  const code = l.slice(0, 2);
  return isLang(code) ? code : "en";
}

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void; dict: Record<string, string>; notes: Record<string, string> }>({ lang: "sv", setLang: () => {}, dict: {}, notes: {} });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("sv");
  const [pack, setPack] = useState<{ lang: Lang; pack: Pack } | null>(null);

  // The saved choice wins; otherwise the browser's language when we have it, else English.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("lang");
      if (isLang(saved)) return setLangState(saved);
    } catch {}
    setLangState(detect());
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    const load = LOADERS[lang];
    if (!load) return;
    let live = true;
    load().then((p) => live && setPack({ lang, pack: p })).catch(() => {});
    return () => {
      live = false;
    };
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem("lang", l);
    } catch {}
  }, []);

  const loaded = pack && pack.lang === lang ? pack.pack : null;
  const dict = lang === "en" ? EN : loaded ? loaded.DICT : {};
  const notes = lang === "en" ? NOTES_EN : loaded ? loaded.NOTES : {};
  return <Ctx.Provider value={{ lang, setLang, dict, notes }}>{children}</Ctx.Provider>;
}

export const useLang = () => useContext(Ctx);

export function useT() {
  const { lang, dict } = useContext(Ctx);
  return (sv: string) => (lang === "sv" ? sv : EXTRA[lang]?.[sv] ?? dict[sv] ?? EXTRA.en?.[sv] ?? EN[sv] ?? sv);
}

// Set notes come from the importers (Swedish); this translates the known sentences.
export function useNote() {
  const { lang, notes } = useContext(Ctx);
  return (note: string) => translateNote(note, lang === "sv" ? {} : notes);
}

export function LangSwitch() {
  const { lang, setLang } = useLang();
  return (
    <label className="langsel" title="Språk / Language">
      <select value={lang} aria-label="Språk / Language" onChange={(e) => setLang(e.target.value as Lang)}>
        {LANGS.map(([code, name]) => (
          <option key={code} value={code} lang={code}>{name}</option>
        ))}
      </select>
    </label>
  );
}
