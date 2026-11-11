hello
world// Collector Assistant: turns a typed question (Swedish or English) into one of a fixed set of intents, without any AI.
// A question that matches nothing returns null; a later version may hand those to a small model that can only pick from
// these same intents. Nothing here builds SQL: each intent maps to a prepared database function.

export type Intent =
  | { name: "nearly_complete"; min: number; sport?: string; limit: number }
  | { name: "missing_cards"; player?: string; sport?: string; limit: number }
  | { name: "top_duplicates"; limit: number }
  | { name: "sell_candidates"; limit: number }
  | { name: "for_sale_marked"; limit: number }
  | { name: "player_collection"; player: string }
  | { name: "collection_summary" }
  | { name: "not_started"; limit: number };

export type IntentName = Intent["name"];

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// Lower case, no accents, words separated by single spaces.
export const flat = (s: string) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9%]+/g, " ")
    .trim();

const SPORTS: [RegExp, string][] = [
  [/\b(amerikansk fotboll|american football|nfl)\b/, "amerikansk-fotboll"],
  // No word boundary after the longer Swedish words, so compounds such as "hockeyset" and "fotbollskort" match too.
  [/\b(ishockey|hockey)|\b(nhl|shl)\b/, "ishockey"],
  [/\b(fotboll|football|soccer)/, "fotboll"],
  [/\b(basket|nba\b)/, "basket"],
  [/\b(baseboll|baseball)|\bmlb\b/, "baseboll"],
  [/\b(motorsport|racing|formel 1|formula 1)|\bf1\b/, "motorsport"],
  [/\btennis/, "tennis"],
  [/\bgolf/, "golf"],
  [/\b(kampsport|martial arts)|\b(mma|ufc)\b/, "kampsport"],
];

// Words that are part of the question and not a player's name.
const STOP = new Set(
  ("vilka vilken vilket hur manga mycket har jag mina min mitt mig vara visa ge mig kan du ska borde bor om och eller en ett det den de som for av pa i till med utan ej inte " +
    "kort korten set seten serie serier saknar saknas saknad dubbletter dubblett klara klar nastan over under procent " +
    "what which how many much do does did i my me have has show give list can you should the a an of in on for to with without not " +
    "cards card sets missing duplicates duplicate dupes nearly almost complete completed percent").split(" "),
);

const COMPOUND = /(korten|kort|cards|card|seten|set|sets)$/;
const SPORT_WORDS = new Set(["ishockey", "hockey", "nhl", "shl", "fotboll", "football", "soccer", "basket", "basketball", "nba", "baseboll", "baseball", "mlb", "motorsport", "racing", "tennis", "golf", "kampsport", "mma", "ufc", "nfl", "american", "amerikansk", "formel", "formula", "f1"]);
const isSportWord = (w: string) => SPORT_WORDS.has(w) || SPORT_WORDS.has(w.replace(/s$/, ""));

function limitOf(q: string, fallback: number): number {
  const m = q.match(/\b(\d{1,4})\b(?!\s*%)/);
  return m ? clamp(parseInt(m[1], 10), 1, 50) : fallback;
}

function sportOf(q: string): string | undefined {
  for (const [re, id] of SPORTS) if (re.test(q)) return id;
  return undefined;
}

// What is left of the question when the question words, sports and numbers are removed: a possible player name.
function playerOf(q: string): string | undefined {
  const words = q
    .split(" ")
    .filter((w) => w && !/^\d+%?$/.test(w) && !STOP.has(w))
    .map((w) => (w.length > 5 && COMPOUND.test(w) ? w.replace(COMPOUND, "") : w))
    .filter((w) => w.length >= 2 && !STOP.has(w) && !isSportWord(w));
  const name = words.join(" ").trim();
  return name.length >= 3 ? name : undefined;
}

export function detectIntent(question: string): Intent | null {
  const q = flat(question);
  if (q.length < 3) return null;
  const sport = sportOf(q);
  const has = (re: RegExp) => re.test(q);

  // Cards marked for sale, and what to sell.
  if (has(/\b(markerat|markerade|marked|flagged|listed)\b/) && has(/\b(salu|forsaljning|salj|sale|sell|selling)\b/)) return { name: "for_sale_marked", limit: limitOf(q, 30) };
  if (has(/\b(salj|saljas|salja|forsaljning|sell|selling|should i sell|to sell)\b/)) return { name: "sell_candidates", limit: limitOf(q, 15) };

  // Sets the user has not started.
  if (has(/\b(inte|ej)\s+(borjat|paborjat|startat)\b/) || has(/\b(not started|haven t i started|haven t started|have not started|havent started|untouched)\b/)) return { name: "not_started", limit: limitOf(q, 30) };

  // Nearly complete sets, optionally over some percentage.
  const pct = q.match(/\b(\d{1,3})\s*(%|procent|percent|pct)/);
  const nearly = has(/\b(nastan|nara|close to|almost|nearly|closest)\b/) && has(/\b(klar|klara|komplett|kompletta|complete|completed|finished|done)\b/);
  const overPct = pct && has(/\b(klar|klara|komplett|kompletta|complete|completed|done)\b/);
  if (nearly || overPct) return { name: "nearly_complete", min: pct ? clamp(parseInt(pct[1], 10), 0, 99) : 70, sport, limit: 15 };

  // Duplicates and the cards I have most of.
  if (has(/\b(dubbletter|dubblett|dubbla|duplicates|duplicate|dupes|extra copies|multiples|flest av|most copies)\b/)) return { name: "top_duplicates", limit: limitOf(q, 15) };

  // What I am missing.
  if (has(/\b(saknar|saknas|saknade|missing|lack|lacking|need)\b/)) {
    const player = playerOf(q);
    return { name: "missing_cards", player, sport, limit: limitOf(q, 30) };
  }

  // How big is my collection, in general.
  if (has(/\b(sammanfattning|oversikt|statistik|summary|overview|stats|statistics|collection size|how big)\b/) || has(/\b(hur manga kort har jag|how many cards do i have|how many cards have i)\b/)) return { name: "collection_summary" };

  // How many cards of one player.
  const player = playerOf(q);
  if (player && has(/\b(hur manga|how many|har jag|do i have|have i|antal|count)\b/)) return { name: "player_collection", player };

  return null;
}

// Short Swedish and English labels for the answer header.
export const INTENT_LABEL: Record<IntentName, string> = {
  nearly_complete: "Nästan klara set",
  missing_cards: "Kort som saknas",
  top_duplicates: "Dina vanligaste dubbletter",
  sell_candidates: "Kort att sälja",
  for_sale_marked: "Kort markerade till försäljning",
  player_collection: "Din samling av spelaren",
  collection_summary: "Din samling i siffror",
  not_started: "Favoritset du inte börjat på",
};

// Ready-made questions shown as buttons; they run without any parsing.
export const SUGGESTIONS: { label: string; intent: Intent }[] = [
  { label: "Mina nästan klara set", intent: { name: "nearly_complete", min: 70, limit: 15 } },
  { label: "Vilka kort saknar jag?", intent: { name: "missing_cards", limit: 30 } },
  { label: "Mina bästa dubbletter", intent: { name: "top_duplicates", limit: 15 } },
  { label: "Kort jag kan sälja", intent: { name: "sell_candidates", limit: 15 } },
  { label: "Markerat till försäljning", intent: { name: "for_sale_marked", limit: 30 } },
  { label: "Favoritset jag inte börjat på", intent: { name: "not_started", limit: 30 } },
  { label: "Min samling i siffror", intent: { name: "collection_summary" } },
];
