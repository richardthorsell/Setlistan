// Set notes come from the importers in Swedish. Each sentence is looked up in the active language's NOTES map;
// source names and dates ("(…)" and "{d}") are kept from the original text. Unknown sentences stay as they are.
export const NOTES_EN: Record<string, string> = {
  "Kan avvika från den slutliga produkten.": "May differ from the final product.",
  "Endast kort och delset; paralleller saknas i PDF:erna.": "Cards and subsets only; the PDFs do not list parallels.",
  "Importerad från Toppss officiella PDF-checklista (…).": "Imported from Topps' official PDF checklist (…).",
  "Kort med icke-unik kod är numrerade löpande med originalkoden som tagg.": "Cards with a non-unique code are numbered consecutively, with the original code as a tag.",
  "Importerad från Leafs officiella checklista (…).": "Imported from Leaf's official checklist (…).",
  "Flera foliesorter (…) ligger som parallellnamn.": "Several foil types (…) are listed as parallel names.",
  "Paralleller tagna från kolumnrubriker eller rubriktext; print run anges bara när den är lika för alla kort i serien.": "Parallels are taken from column headings or heading text; the print run is only given when it is the same for every card in the series.",
  "Importerad från Upper Decks officiella checklista (…).": "Imported from Upper Deck's official checklist (…).",
  "Parallell-set som hör till äldre \"Update\"-serier är inte inlagda.": "Parallel sets belonging to older \"Update\" series are not included.",
  "Paralleller kopplade till basserie efter namn och tryckupplaga tagen från #'d-kolumnen när den är lika för alla kort (…).": "Parallels are linked to the base series by name, and the print run is taken from the #'d column when it is the same for every card (…).",
  "Kort med spelarinitialer som nummer (…) är numrerade löpande med originalkoden som tagg.": "Cards with player initials as their number (…) are numbered consecutively, with the original code as a tag.",
  "Kan avvika från den slutliga produkten; kortnummer saknas på sidan för vissa serier (…).": "May differ from the final product; card numbers are missing on the page for some series (…).",
  "Importerad från Football Cartophilic Info Exchange (…), inlägget publicerat {d}.": "Imported from Football Cartophilic Info Exchange (…), post published {d}.",
  "Importerad från Panini Americas officiella checklista (…).": "Imported from Panini America's official checklist (…).",
  "Importerad från Toppss officiella checklista (…).": "Imported from Topps' official checklist (…).",
  "Saknar lagkolumn.": "No team column.",
  "Paralleller tagna från kolumnrubriker/rubriktext; print run anges bara när den är lika för alla kort i serien (…).": "Parallels are taken from column headings or heading text; the print run is only given when it is the same for every card in the series (…).",
  "Inserts har egna sektioner med odds i namnet där det anges.": "Inserts have their own sections, with the odds in the name where given.",
  "Paralleller finns bara som egna sektioner om sidan listar dem.": "Parallels only exist as their own sections if the page lists them.",
  "Importerad från Coolcards checklistsida (…).": "Imported from Coolcards' checklist page (…).",
  "Paralleller (…) är kopplade till hela sektionen: PDF:ens rutor visar vilka kort som finns i vilken parallell men går inte att läsa ur texten, så alla paralleller gäller inte nödvändigtvis alla kort.": "Parallels (…) are linked to the whole section: the PDF's boxes show which cards exist in which parallel but cannot be read from the text, so not every parallel necessarily applies to every card.",
  "Importerad från SportZoos officiella PDF-checklista.": "Imported from SportZoo's official PDF checklist.",
  "Namn omskrivna från versaler.": "Names rewritten from capitals.",
  "Kortnummer saknas på sidan, så numren är löpande.": "Card numbers are missing on the page, so the numbers are consecutive.",
};

// Repairs text that was saved with its UTF-8 bytes read as Latin-1 ("frÃ¥n" → "från"). Leaves other text alone.
function fixMojibake(s: string): string {
  if (!/[ÃÂ]/.test(s)) return s;
  try {
    const bytes = Uint8Array.from(Array.from(s), (c) => {
      const x = c.charCodeAt(0);
      if (x > 255) throw new Error("not latin1");
      return x;
    });
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return s;
  }
}

export function translateNote(note: string, dict: Record<string, string>): string {
  const s = fixMojibake(note);
  if (!Object.keys(dict).length) return s;
  const parens: string[] = [];
  const dates: string[] = [];
  const norm = s
    .replace(/\((?:[^()]|\([^()]*\))*\)/g, (m) => (parens.push(m), "(…)"))
    .replace(/\d{4}-\d\d-\d\d/g, (m) => (dates.push(m), "{d}"));
  const out = norm.split(/(?<=\.)\s+(?=[A-ZÅÄÖ])/).map((x) => dict[x] ?? x);
  let pi = 0;
  let di = 0;
  return out.join(" ").replace(/\(…\)|\{d\}/g, (m) => (m === "{d}" ? dates[di++] ?? m : parens[pi++] ?? m));
}
