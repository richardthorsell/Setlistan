// Reports of missing cards: turns a pasted list (one card per line) into cards. Plain helpers, no network.

export const MAX_LINES = 40;

export type ParsedLine = { no: string | null; name: string | null };

// "12 Peter Forsberg" -> number 12 and a name. "#7: Sundin" -> number 7 and a name. "BC-244" -> only a number.
// "Peter Forsberg" -> only a name. A line is a number first if its first word contains a digit and is short.
export function parseCardLines(text: string): { lines: ParsedLine[]; tooMany: boolean } {
  const lines: ParsedLine[] = [];
  let seen = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/\s+/g, " ");
    if (!line) continue;
    seen++;
    if (lines.length >= MAX_LINES) continue;
    const space = line.indexOf(" ");
    const first = space === -1 ? line : line.slice(0, space);
    const rest = space === -1 ? "" : line.slice(space + 1).trim();
    if (/\d/.test(first) && first.length <= 12) {
      const no = first.replace(/^#/, "").replace(/[:.,;]+$/, "");
      lines.push({ no: no.slice(0, 20) || null, name: rest ? rest.replace(/^[-–:.,]\s*/, "").slice(0, 120) || null : null });
    } else {
      lines.push({ no: null, name: line.slice(0, 120) });
    }
  }
  return { lines, tooMany: seen > MAX_LINES };
}

// What the answers of the database mean for the user. The answers are counted over a whole list.
export function summarize(results: string[]): { ok: number; duplicate: number; failed: number; limit: boolean } {
  let ok = 0;
  let duplicate = 0;
  let failed = 0;
  let limit = false;
  for (const r of results) {
    if (r === "ok") ok++;
    else if (r === "duplicate") duplicate++;
    else {
      failed++;
      if (r === "limit") limit = true;
    }
  }
  return { ok, duplicate, failed, limit };
}
