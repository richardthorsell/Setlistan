// Setlistan Pulse: plain helpers around the feed that comes from the database (pulse_get). No AI, no network.

export type PulseKind = "almost" | "milestone" | "newset" | "trade" | "listing" | "checklist";
export type PulseStatus = "new" | "seen" | "dismissed" | "expired";
export type PulseItem = {
  id: number;
  kind: PulseKind;
  status: PulseStatus;
  score: number;
  created_at: string;
  expires_at: string | null;
  ref: Record<string, unknown>;
};

// The ready-made sentence of one item. Numbers and names are kept apart from the text so the text can be translated.
export type PulseText = {
  title: string; // Swedish key, translated by the component
  name: string; // a set name or a partner alias, shown as is
  facts: string; // numbers, shown as is
  why: string; // Swedish key
  action: "set" | "trade" | "none";
  setId: string | null;
};

const s = (v: unknown) => (typeof v === "string" ? v : "");
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function describe(it: PulseItem): PulseText {
  const r = it.ref || {};
  const setName = s(r.set_name) || s(r.set_id);
  const setId = s(r.set_id) || null;
  if (it.kind === "almost") {
    const have = n(r.have);
    const total = n(r.total);
    const pct = total > 0 ? Math.round((have / total) * 100) : 0;
    return { title: "Nästan komplett", name: setName, facts: `${have}/${total} · ${pct} %`, why: "Du har nästan hela setet.", action: setId ? "set" : "none", setId };
  }
  if (it.kind === "milestone") {
    const what = s(r.what);
    if (what === "cards") return { title: "Milstolpe", name: "", facts: String(n(r.n)), why: "Antal unika kort i din samling.", action: "none", setId: null };
    if (what === "complete") return { title: "Komplett set", name: setName, facts: `${n(r.total)}/${n(r.total)}`, why: "Du har fått ihop hela setet.", action: setId ? "set" : "none", setId };
    if (what === "set90") return { title: "90 % av ett set", name: setName, facts: `${n(r.have)}/${n(r.total)}`, why: "Du har nått 90 % av setet.", action: setId ? "set" : "none", setId };
    if (what === "first_complete") return { title: "Ditt första kompletta set", name: "", facts: "", why: "Första gången du har ett helt set.", action: "none", setId: null };
    if (what === "five_complete") return { title: "Fem kompletta set", name: "", facts: "5", why: "Du har fem kompletta set.", action: "none", setId: null };
    return { title: "Milstolpe", name: "", facts: "", why: "", action: "none", setId: null };
  }
  if (it.kind === "newset") {
    const year = n(r.year);
    return { title: "Nytt set", name: setName, facts: year ? String(year) : "", why: "Ett nytt set i en sport du samlar.", action: setId ? "set" : "none", setId };
  }
  if (it.kind === "trade") {
    return { title: "Bytesmöjlighet", name: s(r.alias) || "?", facts: `${n(r.receive_n)} ⇄ ${n(r.give_n)}`, why: "En bytespartner har kort du behöver.", action: "trade", setId: null };
  }
  return { title: "Nytt", name: setName, facts: "", why: "", action: setId ? "set" : "none", setId };
}

// "Latest opportunities" are the new items and the seen ones that are not milestones. Everything else is history.
export function splitFeed(items: PulseItem[]): { current: PulseItem[]; history: PulseItem[] } {
  const current: PulseItem[] = [];
  const history: PulseItem[] = [];
  for (const it of items) {
    if (it.status === "new" || (it.status === "seen" && it.kind !== "milestone")) current.push(it);
    else history.push(it);
  }
  return { current, history };
}

// The most useful item: the highest score among the new ones, else among the current ones.
export function nextBest(items: PulseItem[]): PulseItem | null {
  const { current } = splitFeed(items);
  const pick = (list: PulseItem[]) => list.reduce<PulseItem | null>((best, it) => (best === null || it.score > best.score ? it : best), null);
  return pick(current.filter((i) => i.status === "new")) ?? pick(current);
}
