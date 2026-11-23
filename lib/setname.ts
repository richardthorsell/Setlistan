// Set names: the year can stand first or last in the name. These helpers find it and move it, for display and for sorting by series.
// Only for showing: the names in the database are never changed.

export type SplitName = { series: string; years: string | null; atStart: boolean };

// A season such as 1994-1995, 1994-95, 2025-26 or 1994/95 (the second part must be the next year).
const RANGE = /\(?\b((?:19|20)\d{2})\s*[-–\/]\s*((?:19|20)?\d{2})\b\)?/;
// A short season such as 94/95 or 26/27.
const SHORT = /\(?\b(\d{2})\s*\/\s*(\d{2})\b\)?/;
const SINGLE = /\(?\b((?:19|20)\d{2})\b\)?/g;

// The second part of a season must come after the first, at most ten years later (1991-1992, 2003-2005, 2025-26).
function laterYear(a: number, bText: string): boolean {
  const b = Number(bText);
  const gap = bText.length === 4 ? b - a : (b - (a % 100) + 100) % 100;
  return gap >= 1 && gap <= 10;
}

function cut(name: string, start: number, len: number): string {
  const rest = `${name.slice(0, start)} ${name.slice(start + len)}`;
  return rest
    .replace(/\s+/g, " ")
    .replace(/\(\s*\)/g, "")
    .replace(/^[\s\-–:,.]+|[\s\-–:,.]+$/g, "")
    .trim();
}

export function splitYear(name: string): SplitName {
  const none: SplitName = { series: name, years: null, atStart: false };
  const r = RANGE.exec(name);
  if (r && laterYear(Number(r[1]), r[2])) {
    return { series: cut(name, r.index, r[0].length), years: rangeText(r[0]), atStart: r.index === 0 };
  }
  const s = SHORT.exec(name);
  if (s && Number(s[2]) === (Number(s[1]) + 1) % 100) {
    return { series: cut(name, s.index, s[0].length), years: rangeText(s[0]), atStart: s.index === 0 };
  }
  // A single year is only moved when it ends the name or starts it ("Euro 2016 Prizm" stays as it is, the year belongs to the name).
  const singles = [...name.matchAll(SINGLE)];
  if (singles.length === 1) {
    const m = singles[0];
    const at = m.index ?? 0;
    if (at === 0 || at + m[0].length >= name.trimEnd().length) return { series: cut(name, at, m[0].length), years: m[1], atStart: at === 0 };
  }
  return none;
}

// "(1994-95)" -> "1994-95"
function rangeText(token: string): string {
  return token.replace(/[()]/g, "").replace(/\s+/g, "");
}

// The name as it should be shown. With the year first: "1994-1995 Upper Deck Parkhurst". Without a year in the name, the year of the set is put first.
export function displayName(name: string, year: number | null | undefined, yearFirst: boolean): string {
  if (!yearFirst) return name;
  const sp = splitYear(name);
  if (sp.years) return sp.atStart ? name : `${sp.years} ${sp.series}`;
  return year ? `${year} ${name}` : name;
}

// The name without the year, for sorting on the series.
export function seriesOf(name: string): string {
  return splitYear(name).series;
}
