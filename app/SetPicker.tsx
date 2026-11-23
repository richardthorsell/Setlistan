"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { type SetStat, type Sport, SPORTS, matches, sportLabel } from "@/lib/checklist";
import "./panels.css";
import { useT } from "@/lib/i18n";
import { displayName, seriesOf } from "@/lib/setname";

type Props = {
  sets: SetStat[];
  counts: Record<string, number>;
  openId: string | null;
  favs: Set<string>;
  sport: Sport | "";
  setSport: (s: Sport | "") => void;
  onOpen: (id: string) => void;
  onToggleFav: (id: string) => void;
  onSuggest: (query: string) => void;
  suggested: Set<string>;
  libOpen: boolean;
  onLibOpen: (v: boolean) => void;
  before?: ReactNode;
  advanced?: boolean;
};

const nameOf = (s: SetStat) => s.short_name || s.name;

type Sort = "fav" | "az" | "series" | "new" | "old" | "cards" | "done";
type Second = "" | "ynew" | "yold" | "series" | "cards" | "done";
const SORT_KEY = "setlistan:libsort";
const SECOND_KEY = "setlistan:libsort2";
const YEARFIRST_KEY = "setlistan:libyearfirst";
const pctOf = (s: SetStat, n: number) => (s.card_count ? Math.round((n / s.card_count) * 100) : 0);

const Star = ({ on }: { on: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
    <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
  </svg>
);

// The library: your favourites as cards, and a dropdown with search and sport filter for everything else.
export default function SetPicker({ sets, counts, openId, favs, sport, setSport, onOpen, onToggleFav, onSuggest, suggested, libOpen, onLibOpen, before, advanced }: Props) {
  const t = useT();
  const open = libOpen;
  const setOpen = onLibOpen;
  const [q, setQ] = useState("");
  // How the library is ordered; the choice is remembered on this device.
  const [sort, setSortState] = useState<Sort>("fav");
  const [year, setYear] = useState("");
  // Sorting on two levels and the year first in the names (only when the switch library_sort is on); remembered on this device.
  const [second, setSecondState] = useState<Second>("");
  const [yearFirst, setYearFirstState] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem(SORT_KEY);
      if (v === "fav" || v === "az" || v === "series" || v === "new" || v === "old" || v === "cards" || v === "done") setSortState(v);
      const v2 = localStorage.getItem(SECOND_KEY);
      if (v2 === "ynew" || v2 === "yold" || v2 === "series" || v2 === "cards" || v2 === "done") setSecondState(v2);
      setYearFirstState(localStorage.getItem(YEARFIRST_KEY) === "1");
    } catch {}
  }, []);
  const setSecond = (v: Second) => {
    setSecondState(v);
    try {
      localStorage.setItem(SECOND_KEY, v);
    } catch {}
  };
  const setYearFirst = (v: boolean) => {
    setYearFirstState(v);
    try {
      localStorage.setItem(YEARFIRST_KEY, v ? "1" : "0");
    } catch {}
  };
  const setSort = (v: Sort) => {
    setSortState(v);
    try {
      localStorage.setItem(SORT_KEY, v);
    } catch {}
  };

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const years = useMemo(() => [...new Set(sets.filter((s) => !sport || s.sport === sport).map((s) => s.year).filter((y): y is number => typeof y === "number"))].sort((a, b) => b - a), [sets, sport]);
  const list = useMemo(() => {
    const byName = (a: SetStat, b: SetStat) => nameOf(a).localeCompare(nameOf(b), "sv");
    const done = (s: SetStat) => pctOf(s, counts[s.id] || 0);
    type Cmp = (a: SetStat, b: SetStat) => number;
    const base: Record<Sort, Cmp> = {
      fav: (a, b) => (favs.has(b.id) ? 1 : 0) - (favs.has(a.id) ? 1 : 0),
      az: byName,
      series: (a, b) => seriesOf(nameOf(a)).localeCompare(seriesOf(nameOf(b)), "sv"),
      new: (a, b) => (b.year ?? -1) - (a.year ?? -1),
      old: (a, b) => (a.year ?? 9999) - (b.year ?? 9999),
      cards: (a, b) => b.card_count - a.card_count,
      done: (a, b) => done(b) - done(a),
    };
    const then: Record<Exclude<Second, "">, Cmp> = { ynew: base.new, yold: base.old, series: base.series, cards: base.cards, done: base.done };
    const primary: Sort = advanced || sort !== "series" ? sort : "fav";
    const secondary = advanced && second ? then[second] : null;
    const order: Cmp = (a, b) => base[primary](a, b) || (secondary ? secondary(a, b) : 0) || byName(a, b);
    return (sport ? sets.filter((s) => s.sport === sport) : sets)
      .filter((s) => !year || String(s.year ?? "") === year)
      .filter((s) => !q.trim() || matches(s, q))
      .sort(order);
  }, [sets, sport, q, favs, sort, year, counts, advanced, second]);
  const shown = (s: SetStat) => (advanced && yearFirst ? displayName(nameOf(s), s.year, true) : nameOf(s));
  const favSets = useMemo(() => sets.filter((s) => favs.has(s.id)).sort((a, b) => nameOf(a).localeCompare(nameOf(b), "sv")), [sets, favs]);
  const current = sets.find((s) => s.id === openId);
  const used = SPORTS.filter((s) => sets.some((x) => x.sport === s.id));

  return (
    <div className="picker-wrap">

      <div className="picker" ref={box}>
        {open && (
          <div className="picker-panel">
            <div className="row">
              <input ref={input} type="search" className="shelf-search grow" placeholder={t("Sök album, till exempel Bundesliga eller Chrome")} aria-label={t("Sök album")} value={q} onChange={(e) => setQ(e.target.value)} />
              <select className="sport-select" aria-label={t("Sport")} value={sport} onChange={(e) => setSport(e.target.value as Sport | "")}>
                <option value="">{t("Alla sporter")}</option>
                {used.map((s) => (
                  <option key={s.id} value={s.id}>{t(s.label)}</option>
                ))}
              </select>
            </div>
            <div className="row">
              <select className="sport-select" aria-label={t("Sortera")} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="fav">{t("Favoriter först")}</option>
                <option value="az">{t("Namn A–Ö")}</option>
                {advanced && <option value="series">{t("Serie A–Ö (utan år)")}</option>}
                {years.length > 0 && <option value="new">{t("Nyast först")}</option>}
                {years.length > 0 && <option value="old">{t("Äldst först")}</option>}
                <option value="cards">{t("Flest kort")}</option>
                <option value="done">{t("Mest komplett")}</option>
              </select>
              {years.length > 0 && (
                <select className="sport-select" aria-label={t("År")} value={year} onChange={(e) => setYear(e.target.value)}>
                  <option value="">{t("Alla år")}</option>
                  {years.map((y) => (
                    <option key={y} value={String(y)}>{y}</option>
                  ))}
                </select>
              )}
            </div>
            {advanced && (
              <div className="row">
                <select className="sport-select" aria-label={t("Sedan efter")} value={second} onChange={(e) => setSecond(e.target.value as Second)}>
                  <option value="">{t("Sedan: inget")}</option>
                  <option value="ynew">{t("Sedan: år, nyast först")}</option>
                  <option value="yold">{t("Sedan: år, äldst först")}</option>
                  <option value="series">{t("Sedan: serie A–Ö")}</option>
                  <option value="cards">{t("Sedan: flest kort")}</option>
                  <option value="done">{t("Sedan: mest komplett")}</option>
                </select>
                <label className="row" style={{ gap: 6 }}>
                  <input type="checkbox" checked={yearFirst} onChange={(e) => setYearFirst(e.target.checked)} />
                  <span>{t("Visa år först")}</span>
                </label>
              </div>
            )}
            <div className="note mono">{list.length} av {sets.length} set</div>
            <div className="picker-list" role="list" aria-label={t("Album")}>
              {list.map((s) => {
                const n = counts[s.id] || 0;
                return (
                  <div key={s.id} className={`picker-row ${s.id === openId ? "active" : ""}`} role="listitem" aria-current={s.id === openId ? "true" : undefined}>
                    <button className="picker-pick" type="button" onClick={() => { onOpen(s.id); setOpen(false); setQ(""); }}>
                      <span className="picker-name">{shown(s)}</span>
                      <span className="sub mono">{!sport && `${t(sportLabel(s.sport))} · `}{n} / {s.card_count}</span>
                    </button>
                    <button className={`star ${favs.has(s.id) ? "on" : ""}`} type="button" aria-pressed={favs.has(s.id)} aria-label={favs.has(s.id) ? `${t("Ta bort")} ${nameOf(s)} ${t("från favoriter")}` : `${t("Lägg")} ${nameOf(s)} ${t("i favoriter")}`} onClick={() => onToggleFav(s.id)}>
                      <Star on={favs.has(s.id)} />
                    </button>
                  </div>
                );
              })}
              {!list.length && <div className="empty">{t("Inga album matchar.")}</div>}
            </div>
            {q.trim() && (
              <div className="nomatch">
                <div>
                  <strong>{list.length ? t("Saknas det du söker?") : t("Inget album matchar.")}</strong>{" "}{t("Föreslå setet så lägger administratörerna in det.")}</div>
                <button className="btn primary small" type="button" disabled={suggested.has(q.trim().toLowerCase())} onClick={() => onSuggest(q)}>
                  {suggested.has(q.trim().toLowerCase()) ? t("Förslaget är skickat") : `${t("Föreslå")} “${q.trim()}”`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {before}
      <div className="fav-head label" id="fav-sets">{t("Set du favoritmarkerat")}</div>
      {favSets.length ? (
        <div className="shelf">
          {favSets.map((s) => {
            const n = counts[s.id] || 0;
            const p = pctOf(s, n);
            return (
              <div key={s.id} className={`shelf-item fav-card ${s.id === openId ? "active" : ""}`}>
                <button className="fav-open" type="button" onClick={() => onOpen(s.id)}>
                  <strong>{shown(s)}</strong>
                  <span className="bar"><i style={{ width: `${p}%` }} /></span>
                  <span className="sub mono">{n} / {s.card_count} · {p} %</span>
                </button>
                <button className="star on" type="button" aria-pressed="true" aria-label={`${t("Ta bort")} ${nameOf(s)} ${t("från favoriter")}`} onClick={() => onToggleFav(s.id)}>
                  <Star on />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="note">{t("Du har inga favoriter än. Öppna listan ovan och tryck på stjärnan vid ett album, så hamnar det här.")}</div>
      )}
    </div>
  );
}
