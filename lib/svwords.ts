// Swedish wording: "set" for a whole release and "serie" for its parts. Applied to the Swedish text only,
// so the other languages keep looking up the original keys and keep their translations.
const EXACT: Record<string, string> = {
  "delset": "serier",
  "Hitta alla en spelares kort i alla set, eller välj ett set här under.": "Hitta en spelares kort i alla set, eller välj ett set här under.",
  "Sök fram en checklista, pricka av korten du har och se direkt vilka som fattas.": "Sök fram ett set, pricka av korten du har och se direkt vilka som fattas.",
  "Klistra in checklista": "Klistra in set",
  "Verifierad checklista": "Verifierat set",
  "Inklistrad checklista": "Inklistrat set",
  "Checklistorna kommer från öppna källor. Hämtade listor kan innehålla fel, så kontrollera mot kortets baksida eller tillverkarens lista när det är viktigt.": "Seten kommer från öppna källor. Hämtade set kan innehålla fel, så kontrollera mot kortets baksida eller tillverkarens lista när det är viktigt.",
  "Hitta checklistan": "Hitta setet",
  "Samlarkort · checklistor": "Samlarkort · set",
  "Här söker du fram checklistor för samlarkort, prickar av korten du har och ser direkt vilka som saknas. Vi visar dig runt på en minut.": "Här söker du fram set för samlarkort, prickar av korten du har och ser direkt vilka som saknas. Vi visar dig runt på en minut.",
  "Sök en spelare och tryck på stjärnan för att följa honom. Då får du en egen checklista med alla hans kort.": "Sök en spelare och tryck på stjärnan för att följa honom. Då får du ett eget set med alla hans kort.",
  "Välj album": "Välj set",
  "Sök album, till exempel Bundesliga eller Chrome": "Sök set, till exempel Bundesliga eller Chrome",
  "Sök album": "Sök set",
  "Album": "Set",
  "Inga album matchar.": "Inga set matchar.",
  "Inget album matchar.": "Inget set matchar.",
  "Du har inga favoriter än. Öppna listan ovan och tryck på stjärnan vid ett album, så hamnar det här.": "Du har inga favoriter än. Öppna listan ovan och tryck på stjärnan vid ett set, så hamnar det här.",
};

const RULES: [RegExp, string][] = [
  [/\b(Alla|alla|egna|\d+) delset\b/g, "$1 serier"],
  [/\bdelsetet\b/g, "serien"],
  [/\bDelset\b/g, "Serie"],
  [/\bdelset\b/g, "serie"],
];

export function svWords(sv: string): string {
  const hit = EXACT[sv];
  if (hit !== undefined) return hit;
  if (!/delset|Delset/i.test(sv)) return sv;
  let s = sv;
  for (const [re, to] of RULES) s = s.replace(re, to);
  return s;
}
