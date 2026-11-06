export type SetStat = {
  id: string;
  name: string;
  short_name: string | null;
  keywords: string;
  source: string;
  notes: string;
  verified: boolean;
  status: string;
  created_by: string | null;
  created_at: string;
  card_count: number;
  section_count: number;
  sport: Sport;
};

export const SPORTS = [
  { id: "fotboll", label: "Fotboll" },
  { id: "ishockey", label: "Ishockey" },
  { id: "basket", label: "Basket" },
  { id: "amerikansk-fotboll", label: "Amerikansk fotboll" },
  { id: "baseboll", label: "Baseboll" },
  { id: "motorsport", label: "Motorsport" },
  { id: "tennis", label: "Tennis" },
  { id: "golf", label: "Golf" },
  { id: "kampsport", label: "Kampsport" },
  { id: "ovrigt", label: "Övrigt" },
] as const;
export type Sport = (typeof SPORTS)[number]["id"];
export const sportLabel = (id: string) => SPORTS.find((s) => s.id === id)?.label ?? "Övrigt";
export type Card = { id: number; section_id: number; no: number; name: string; team: string; tags: string[] };
export type Section = { id: number; code: string; name: string; position: number; cards: Card[] };
export type PastedSection = { code: string; name: string; cards: { no: number; name: string; team: string; tags: string[] }[] };

export const norm = (s: string) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export const slug = (s: string) => norm(s).replace(/ /g, "-").slice(0, 60) || "set";

// Words of a text, with years written as two digits so "2026/27" and "26/27" are the same.
export const tokens = (s: string) =>
  norm(s)
    .split(" ")
    .filter(Boolean)
    .map((w) => (/^20\d\d$/.test(w) ? w.slice(2) : w));

export type Parallel = { id: number; section_id: number | null; name: string; print_run: number | null; position: number };
export const parallelLabel = (p: { name: string; print_run: number | null }) =>
  p.print_run === 1 ? `${p.name} 1/1` : p.print_run ? `${p.name} /${p.print_run}` : p.name;

export const label = (sec: { code: string }, c: { no: number }) => (sec.code ? `${sec.code} ${c.no}` : String(c.no));

export function matches(set: SetStat, query: string) {
  const hay = norm(`${set.name} ${set.short_name || ""} ${set.keywords}`);
  return norm(query)
    .split(" ")
    .filter(Boolean)
    .every((w) => hay.includes(w) || hay.includes(w.replace(/^20(\d\d)$/, "$1")) || hay.includes(w.replace(/^(\d\d)$/, "20$1")));
}

export function ranges(nums: number[]) {
  const sorted = [...nums].sort((a, b) => a - b);
  const out: string[] = [];
  let s: number | null = null;
  let p = 0;
  for (const n of sorted) {
    if (s === null) {
      s = p = n;
    } else if (n === p + 1) {
      p = n;
    } else {
      out.push(s === p ? String(s) : `${s}–${p}`);
      s = p = n;
    }
  }
  if (s !== null) out.push(s === p ? String(s) : `${s}–${p}`);
  return out.join(", ");
}

// One card per line: "1 Max Dowman, Arsenal", "BM 1 | Max Dowman | Arsenal", "23 Jaden Dixon - Arsenal RC".
// A line starting with ### names the next subset.
export function parsePaste(text: string): PastedSection[] {
  const map = new Map<string, PastedSection>();
  let pendingName: string | null = null;
  for (let line of text.split(/\r?\n/)) {
    line = line.trim();
    if (!line) continue;
    const h = line.match(/^#{1,4}\s*(.+)$/);
    if (h) {
      pendingName = h[1].trim();
      continue;
    }
    const m = line.match(/^(\d?[A-Za-z]{1,5})?[\s\-#]*?(\d{1,4})[\s.:|)\-–]+(.+)$/);
    if (!m) continue;
    const code = (m[1] || "").toUpperCase();
    const no = parseInt(m[2], 10);
    let rest = m[3];
    const rc = /\b(RC|rookie)\b/i.test(rest);
    rest = rest.replace(/\(?\b(RC|rookie card|rookie)\b\)?/gi, "").trim();
    const parts = rest.split(/\s*\|\s*|\s+[-–]\s+|\s*,\s*|\t+/).filter(Boolean);
    const key = code || "#";
    if (!map.has(key)) map.set(key, { code, name: pendingName || code || "Bas", cards: [] });
    else if (pendingName && map.get(key)!.name === code) map.get(key)!.name = pendingName;
    pendingName = null;
    const sec = map.get(key)!;
    if (sec.cards.some((c) => c.no === no)) continue;
    sec.cards.push({ no, name: parts[0] || rest, team: parts.slice(1).join(", "), tags: rc ? ["RC"] : [] });
  }
  const out = [...map.values()];
  out.forEach((s) => s.cards.sort((a, b) => a.no - b.no));
  return out.sort((a, b) => (a.code === "" ? -1 : b.code === "" ? 1 : 0));
}

// "1-20, 45, BM 3, GL 1-5" -> matching card ids in the open set.
export function quickIds(sections: Section[], input: string) {
  const byCode = new Map(sections.map((s) => [s.code.toUpperCase(), s]));
  const ids: number[] = [];
  const bad: string[] = [];
  for (const tok of input.split(/[,;]+/).map((x) => x.trim()).filter(Boolean)) {
    // The code may itself end in a digit (e.g. "SBC2 271-503"), so take the shortest prefix that leaves a valid number or range.
    const m = tok.match(/^(.*?)\s*#?(\d+)(?:\s*[-–]\s*(\d+))?$/);
    const sec = m && byCode.get(m[1].trim().toUpperCase());
    if (!m || !sec) {
      bad.push(tok);
      continue;
    }
    const a = +m[2];
    const z = m[3] ? +m[3] : a;
    for (const c of sec.cards) if (c.no >= Math.min(a, z) && c.no <= Math.max(a, z)) ids.push(c.id);
  }
  return { ids, bad };
}
