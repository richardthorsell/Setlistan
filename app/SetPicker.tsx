"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type SetStat, type Sport, SPORTS, matches, sportLabel } from "@/lib/checklist";
import "./panels.css";

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
};

const nameOf = (s: SetStat) => s.short_name || s.name;
const pctOf = (s: SetStat, n: number) => (s.card_count ? Math.round((n / s.card_count) * 100) : 0);

const Star = ({ on }: { on: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
    <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
  </svg>
);

// The library: your favourites as cards, and a dropdown with search and sport filter for everything else.
export default function SetPicker({ sets, counts, openId, favs, sport, setSport, onOpen, onToggleFav, onSuggest, suggested }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

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

  const list = useMemo(
    () =>
      (sport ? sets.filter((s) => s.sport === sport) : sets)
        .filter((s) => !q.trim() || matches(s, q))
        .sort((a, b) => (favs.has(b.id) ? 1 : 0) - (favs.has(a.id) ? 1 : 0) || nameOf(a).localeCompare(nameOf(b), "sv")),
    [sets, sport, q, favs],
  );
  const favSets = useMemo(() => sets.filter((s) => favs.has(s.id)).sort((a, b) => nameOf(a).localeCompare(nameOf(b), "sv")), [sets, favs]);
  const current = sets.find((s) => s.id === openId);
  const used = SPORTS.filter((s) => sets.some((x) => x.sport === s.id));

  return (
    <div className="picker-wrap">
      <div className="label">Biblioteket</div>

      <div className="picker" ref={box}>
        <button className="picker-btn" type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <span>{current ? nameOf(current) : `Välj album (${sets.length})`}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
        </button>
        {open && (
          <div className="picker-panel">
            <div className="row">
              <input ref={input} type="search" className="shelf-search grow" placeholder="Sök album, till exempel Bundesliga eller Chrome" aria-label="Sök album" value={q} onChange={(e) => setQ(e.target.value)} />
              <select className="sport-select" aria-label="Sport" value={sport} onChange={(e) => setSport(e.target.value as Sport | "")}>
                <option value="">Alla sporter</option>
                {used.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>
            <div className="note mono">{list.length} av {sets.length} album</div>
            <div className="picker-list" role="listbox" aria-label="Album">
              {list.map((s) => {
                const n = counts[s.id] || 0;
                return (
                  <div key={s.id} className={`picker-row ${s.id === openId ? "active" : ""}`} role="option" aria-selected={s.id === openId}>
                    <button className="picker-pick" type="button" onClick={() => { onOpen(s.id); setOpen(false); setQ(""); }}>
                      <span className="picker-name">{nameOf(s)}</span>
                      <span className="sub mono">{!sport && `${sportLabel(s.sport)} · `}{n} / {s.card_count}</span>
                    </button>
                    <button className={`star ${favs.has(s.id) ? "on" : ""}`} type="button" aria-pressed={favs.has(s.id)} aria-label={favs.has(s.id) ? `Ta bort ${nameOf(s)} från favoriter` : `Lägg ${nameOf(s)} i favoriter`} onClick={() => onToggleFav(s.id)}>
                      <Star on={favs.has(s.id)} />
                    </button>
                  </div>
                );
              })}
              {!list.length && <div className="empty">Inga album matchar.</div>}
            </div>
            {q.trim() && (
              <div className="nomatch">
                <div>
                  <strong>{list.length ? "Saknas det du söker?" : "Inget album matchar."}</strong> Föreslå setet så lägger administratörerna in det.
                </div>
                <button className="btn primary small" type="button" disabled={suggested.has(q.trim().toLowerCase())} onClick={() => onSuggest(q)}>
                  {suggested.has(q.trim().toLowerCase()) ? "Förslaget är skickat" : `Föreslå “${q.trim()}”`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="fav-head label">Favoriter</div>
      {favSets.length ? (
        <div className="shelf">
          {favSets.map((s) => {
            const n = counts[s.id] || 0;
            const p = pctOf(s, n);
            return (
              <div key={s.id} className={`shelf-item fav-card ${s.id === openId ? "active" : ""}`}>
                <button className="fav-open" type="button" onClick={() => onOpen(s.id)}>
                  <strong>{nameOf(s)}</strong>
                  <span className="bar"><i style={{ width: `${p}%` }} /></span>
                  <span className="sub mono">{n} / {s.card_count} · {p} %</span>
                </button>
                <button className="star on" type="button" aria-pressed="true" aria-label={`Ta bort ${nameOf(s)} från favoriter`} onClick={() => onToggleFav(s.id)}>
                  <Star on />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="note">Du har inga favoriter än. Öppna listan ovan och tryck på stjärnan vid ett album, så hamnar det här.</div>
      )}
    </div>
  );
}
