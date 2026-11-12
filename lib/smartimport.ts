// Smart Import: reads a collection from a file or pasted text, in the browser, into one normalized row format.
// Nothing here talks to the database, evaluates a formula or runs code from a cell. The original values are kept next to the normalized ones.

export const LIMITS = { bytes: 5 * 1024 * 1024, rows: 20000, sheets: 20, cell: 300 } as const;

export type Table = string[][];
export type Source = "xlsx" | "csv" | "tsv" | "paste" | "list";
// `have` is a yes/no (or a number) column that says whether the card is owned. `section` is a subset given by name ("Vintage"), `code` by its code ("PB").
export type Field = "set" | "year" | "code" | "section" | "no" | "name" | "team" | "qty" | "have" | "parallel" | "serial" | "status";
export type Mapping = Partial<Record<Field, number>>;

// One normalized row. `n` is the row number in the source, `o` the original values as text.
export type NormRow = { set: string; year: number | null; code: string; section: string; no: number | null; name: string; team: string; qty: number | null; parallel: string; serial: string; status: string };
export type Row = { n: number; r: NormRow; o: Record<string, string> };

export class ImportError extends Error {}

// ---------- text ----------

// UTF-8 when the bytes are valid UTF-8, otherwise Windows-1252 (what Excel's older CSV export uses).
export function decodeBytes(buf: ArrayBuffer): string {
  if (buf.byteLength > LIMITS.bytes) throw new ImportError("too_large");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    text = new TextDecoder("windows-1252").decode(buf);
  }
  return text.replace(/^﻿/, "");
}

const flat = (s: string) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9#%/]+/g, " ")
    .trim();

// A cell is text. Nothing is evaluated; a cell that starts like a formula is kept as text and counted so the user can be told.
export function cleanCell(v: unknown): string {
  let s = v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? "" : String(v);
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim();
  return s.length > LIMITS.cell ? s.slice(0, LIMITS.cell) : s;
}
export const looksLikeFormula = (s: string) => /^[=@]/.test(s) || /^[+-][A-Za-z(]/.test(s);

// ---------- delimited text ----------

export function detectDelimiter(text: string): "\t" | ";" | "," {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 8);
  const score = (d: string) => {
    const counts = lines.map((l) => {
      let q = false;
      let n = 0;
      for (const ch of l) {
        if (ch === '"') q = !q;
        else if (ch === d && !q) n++;
      }
      return n;
    });
    const min = Math.min(...counts);
    return counts.length && min > 0 ? min * 1000 + counts.filter((c) => c === counts[0]).length : 0;
  };
  const best = (["\t", ";", ","] as const).map((d) => [d, score(d)] as const).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ",";
}

// A small CSV reader: quotes, doubled quotes and line breaks inside quotes. Stops at the row limit.
export function parseDelimited(text: string, delim: string): Table {
  const rows: Table = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  const pushCell = () => {
    row.push(cleanCell(cell));
    cell = "";
  };
  const pushRow = () => {
    pushCell();
    if (row.some((c) => c !== "")) rows.push(row);
    row = [];
    if (rows.length > LIMITS.rows + 1) throw new ImportError("too_many_rows");
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") q = true;
    else if (ch === delim) pushCell();
    else if (ch === "\n") pushRow();
    else if (ch === "\r") {
      if (text[i + 1] === "\n") i++;
      pushRow();
    } else cell += ch;
  }
  if (cell !== "" || row.length) pushRow();
  return rows;
}

// Rows of an Excel sheet (values only, as returned by the reader) to text cells.
export function tableFromSheet(rows: unknown[][]): Table {
  if (rows.length > LIMITS.rows + 1) throw new ImportError("too_many_rows");
  return rows.map((r) => r.map(cleanCell)).filter((r) => r.some((c) => c !== ""));
}

// ---------- columns ----------

const SYNONYMS: Record<Field, string[]> = {
  set: ["set", "set name", "setnamn", "serie", "series", "product", "produkt", "checklist", "samling", "collection", "album", "brand set"],
  year: ["year", "ar", "season", "sasong", "ar sasong", "years"],
  code: ["prefix", "card prefix", "code", "kod"],
  section: ["typ", "type", "subset", "delset", "delserie", "insert", "insert set", "section", "kategori", "category"],
  no: ["number", "no", "nr", "num", "#", "card number", "card no", "card #", "kortnummer", "nummer", "card nr", "cardnumber"],
  name: ["player", "name", "spelare", "namn", "athlete", "player name", "card name", "kortnamn", "title"],
  team: ["team", "lag", "klubb", "club", "team name", "organization"],
  qty: ["quantity", "qty", "antal", "count", "copies", "ex", "exemplar", "amount"],
  have: ["har", "har kortet", "har jag", "owned", "have", "agd", "agda", "ager", "collected", "samlad", "mina"],
  parallel: ["parallel", "parallell", "variant", "version", "color", "colour", "farg", "refractor", "finish"],
  serial: ["serial", "serial number", "serienummer", "numbered", "print run", "serial no", "sn"],
  status: ["status", "condition", "skick", "grade", "graded"],
};

export function mapColumns(header: string[]): Mapping {
  const m: Mapping = {};
  header.forEach((h, i) => {
    const k = flat(h);
    if (!k) return;
    for (const f of Object.keys(SYNONYMS) as Field[]) {
      if (m[f] === undefined && SYNONYMS[f].includes(k)) {
        m[f] = i;
        return;
      }
    }
  });
  return m;
}
export const looksLikeHeader = (row: string[]) => Object.keys(mapColumns(row)).length >= 2;

// ---------- values ----------

// "BM 12", "BM-12", "BM12", "SBC2 271", "#12", "12", "12/100" -> subset code and number.
export function parseCardNo(s: string): { code: string; no: number } | null {
  const v = cleanCell(s).replace(/^#\s*/, "");
  let m = v.match(/^([A-Za-z]{1,5}\d)[\s\-#]+(\d{1,5})(?:\s*\/\s*\d+)?$/);
  if (!m) m = v.match(/^([A-Za-z]{1,5})[\s\-#]*(\d{1,5})(?:\s*\/\s*\d+)?$/);
  if (m) return { code: m[1].toUpperCase(), no: parseInt(m[2], 10) };
  m = v.match(/^(\d{1,5})(?:\s*\/\s*\d+)?$/);
  return m ? { code: "", no: parseInt(m[1], 10) } : null;
}

// "2", "x2", "2x", "×3" -> a number from 1 to 999; null when it is not a usable quantity.
export function parseQty(s: string): number | null {
  const v = cleanCell(s).toLowerCase();
  if (v === "") return 1;
  const m = v.match(/^(?:[x×]\s*)?(\d{1,4})(?:\s*[x×])?$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n >= 1 && n <= 999 ? n : null;
}

// A year or a season in a set text: "1993-94", "93-94", "2024/25", "1995". Returns the start year and the text without it.
export function seasonYear(text: string): { year: number | null; rest: string } {
  const t = cleanCell(text);
  let m = t.match(/(?<!\d)((?:19|20)\d{2})\s*[-–/]\s*(?:(?:19|20)\d{2}|\d{2})(?!\d)/);
  if (m) return { year: parseInt(m[1], 10), rest: t.replace(m[0], " ").replace(/\(\s*\)/g, " ").replace(/\s+/g, " ").trim() };
  m = t.match(/(?<!\d)(\d{2})\s*[-–/]\s*\d{2}(?!\d)/);
  if (m) {
    const a = parseInt(m[1], 10);
    return { year: a >= 30 ? 1900 + a : 2000 + a, rest: t.replace(m[0], " ").replace(/\(\s*\)/g, " ").replace(/\s+/g, " ").trim() };
  }
  m = t.match(/(?<!\d)((?:19|20)\d{2})(?!\d)/);
  if (m) return { year: parseInt(m[1], 10), rest: t.replace(m[0], " ").replace(/\(\s*\)/g, " ").replace(/\s+/g, " ").trim() };
  return { year: null, rest: t };
}

// ---------- yes/no columns ----------

// A "have it" cell: yes/true/x/1 or a number is owned (the number is the quantity), no/false/0/empty is not owned, anything else is unclear (null).
const YES = /^(true|sant|ja|yes|y|x|ok|✓|✔|✅|har|finns)$/i;
const NO = /^(false|falskt|nej|no|n|-|–|✗|✘|❌)$/i;
export function parseHave(s: string): number | null {
  const v = cleanCell(s);
  if (v === "" || NO.test(v)) return 0;
  if (YES.test(v)) return 1;
  const m = v.match(/^(?:[x×]\s*)?(\d{1,4})(?:\s*[x×])?$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n === 0 ? 0 : n <= 999 ? n : null;
}

// Columns that look like yes/no columns: at least one "yes" and nothing but yes/no/empty. Used to suggest parallel columns.
export function flagColumns(table: Table, hasHeader: boolean): number[] {
  const body = hasHeader ? table.slice(1) : table;
  const width = Math.max(0, ...table.slice(0, 50).map((r) => r.length));
  const out: number[] = [];
  for (let k = 0; k < width; k++) {
    let yes = 0;
    let ok = true;
    for (const r of body.slice(0, 2000)) {
      const v = r[k] ?? "";
      if (v === "") continue;
      if (YES.test(v) || v === "1") yes++;
      else if (!NO.test(v) && v !== "0") {
        ok = false;
        break;
      }
    }
    if (ok && yes > 0) out.push(k);
  }
  return out;
}

// ---------- tables ----------

export type TableResult = { rows: Row[]; formulaCells: number; skipped: number; notOwned: number };
export type TableOptions = {
  defaultSet?: string;
  hasHeader?: boolean;
  // Columns whose yes/no values mean "I have this parallel". The column heading is the name of the parallel.
  flagCols?: number[];
};

// Rows from a table with a mapping from columns to fields. `defaultSet` is used when there is no set column.
// With a `have` column only rows marked as owned become rows; without one every row is owned, unless parallel columns are given (then only the parallels are).
export function rowsFromTable(table: Table, mapping: Mapping, opts: TableOptions = {}): TableResult {
  const header = opts.hasHeader === false ? [] : table[0] || [];
  const body = opts.hasHeader === false ? table : table.slice(1);
  if (body.length > LIMITS.rows) throw new ImportError("too_many_rows");
  const get = (r: string[], f: Field) => (mapping[f] === undefined ? "" : r[mapping[f] as number] ?? "");
  const flagCols = (opts.flagCols || []).filter((k) => !Object.values(mapping).includes(k));
  const rows: Row[] = [];
  let formulaCells = 0;
  let skipped = 0;
  let notOwned = 0;
  let extra = 0;
  body.forEach((r, i) => {
    for (const c of r) if (looksLikeFormula(c)) formulaCells++;
    const n = i + (opts.hasHeader === false ? 1 : 2);
    const o: Record<string, string> = {};
    const seen: Record<string, number> = {};
    r.forEach((c, k) => {
      let key = header[k] || `col${k + 1}`;
      // two columns with the same heading must not overwrite each other
      seen[key] = (seen[key] || 0) + 1;
      if (seen[key] > 1) key = `${key} (${seen[key]})`;
      if (c !== "") o[key] = c;
    });
    const setCell = get(r, "set") || opts.defaultSet || "";
    const yearCell = get(r, "year");
    const sy = seasonYear(setCell);
    const yearFromCol = yearCell ? seasonYear(yearCell).year : null;
    const noCell = get(r, "no");
    const parsed = noCell ? parseCardNo(noCell) : null;
    const explicitCode = get(r, "code");
    const name = get(r, "name");
    if (!noCell && !name && !setCell) {
      skipped++;
      return;
    }
    const base: NormRow = {
      set: sy.rest || setCell,
      year: yearFromCol ?? sy.year,
      code: (explicitCode ? explicitCode.toUpperCase().replace(/\s+/g, "") : parsed?.code) || "",
      section: get(r, "section"),
      no: parsed ? parsed.no : null,
      name,
      team: get(r, "team"),
      qty: 1,
      parallel: get(r, "parallel"),
      serial: get(r, "serial").slice(0, 20),
      status: get(r, "status"),
    };
    const plainQty = mapping.qty === undefined ? null : parseQty(get(r, "qty"));
    let emitted = 0;
    // the card itself
    const haveCell = mapping.have === undefined ? null : parseHave(get(r, "have"));
    if (mapping.have !== undefined) {
      if (haveCell === 0) notOwned++;
      else rows.push({ n, o, r: { ...base, qty: mapping.qty !== undefined ? plainQty : haveCell === null ? null : haveCell } }), emitted++;
    } else if (!flagCols.length) {
      rows.push({ n, o, r: { ...base, qty: mapping.qty === undefined ? 1 : plainQty } });
      emitted++;
    }
    // the parallels: one row for each yes in a parallel column
    for (const k of flagCols) {
      const have = parseHave(r[k] ?? "");
      if (have === 0) continue;
      if (rows.length >= LIMITS.rows) throw new ImportError("too_many_rows");
      // rows made from one source row get numbers above 100000, so every row has its own number
      rows.push({ n: 100000 + ++extra, o: { ...o, rad: String(n) }, r: { ...base, parallel: cleanCell(header[k] || `col${k + 1}`), qty: have === null ? null : have } });
      emitted++;
    }
    if (!emitted && mapping.have === undefined) notOwned++;
  });
  if (rows.length > LIMITS.rows) throw new ImportError("too_many_rows");
  return { rows, formulaCells, skipped, notOwned };
}

// ---------- lists with a set heading ----------

// "1993-94 Parkhurst" as a heading followed by "#12 Håkan Loob x2" or "BM 5 Name - Team" lines.
export function parseList(text: string, opts: { defaultSet?: string } = {}): TableResult {
  const lines = text.split(/\r?\n/);
  if (lines.length > LIMITS.rows * 2) throw new ImportError("too_many_rows");
  const rows: Row[] = [];
  let heading = opts.defaultSet || "";
  let formulaCells = 0;
  let skipped = 0;
  const cardLine = /^#?\s*(?:([A-Za-z]{1,5}\d?)[\s\-#]+|([A-Za-z]{1,5})(?=\d))?(\d{1,5})(?:[\s.:|)\-–]+(.*))?$/;
  lines.forEach((raw, i) => {
    const line = cleanCell(raw);
    if (!line) return;
    if (looksLikeFormula(line)) formulaCells++;
    const h = line.match(/^#{2,4}\s*(.+)$/) || line.match(/^#\s+(\D.*)$/);
    if (h) {
      heading = h[1].trim();
      return;
    }
    const m = line.match(cardLine);
    // a bare year such as "1994 Topps Chrome" is a heading, not card number 1994
    const bareYear = m && !m[1] && !m[2] && !line.startsWith("#") && parseInt(m[3], 10) >= 1900 && parseInt(m[3], 10) <= 2100;
    if (!m || bareYear) {
      heading = line;
      return;
    }
    const code = (m[1] || m[2] || "").toUpperCase();
    let rest = (m[4] || "").trim();
    let qty: number | null = 1;
    const q = rest.match(/\s*(?:[x×]\s*(\d{1,3})|(\d{1,3})\s*[x×])\s*$/i);
    if (q) {
      qty = parseInt(q[1] || q[2], 10);
      rest = rest.slice(0, q.index).trim();
    }
    const parts = rest.split(/\s+[-–|]\s+|\s*,\s*|\t+/).filter(Boolean);
    const sy = seasonYear(heading);
    if (rows.length >= LIMITS.rows) throw new ImportError("too_many_rows");
    rows.push({
      n: i + 1,
      o: { rad: line },
      r: { set: sy.rest || heading, year: sy.year, code, section: "", no: parseInt(m[3], 10), name: parts[0] || "", team: parts.slice(1).join(", "), qty, parallel: "", serial: "", status: "" },
    });
  });
  skipped = 0;
  return { rows, formulaCells, skipped, notOwned: 0 };
}

// ---------- pasted text: a table or a list ----------

export type Parsed =
  | { kind: "table"; table: Table; mapping: Mapping; hasHeader: boolean; delimiter: string }
  | { kind: "list"; result: TableResult };

export function parsePasted(text: string, opts: { defaultSet?: string } = {}): Parsed {
  const t = text.replace(/^﻿/, "");
  if (t.length > LIMITS.bytes) throw new ImportError("too_large");
  const delim = detectDelimiter(t);
  const hasDelims = t.split(/\r?\n/).filter((l) => l.trim()).slice(0, 5).every((l) => l.includes(delim));
  if (hasDelims && t.includes(delim)) {
    const table = parseDelimited(t, delim);
    if (table.length && table[0].length >= 2) {
      const hasHeader = looksLikeHeader(table[0]);
      const mapping = hasHeader ? mapColumns(table[0]) : guessMapping(table[0].length);
      return { kind: "table", table, mapping, hasHeader, delimiter: delim };
    }
  }
  return { kind: "list", result: parseList(t, opts) };
}

// Without a header: common orders. Two columns: number and name. Three: number, name, quantity. Four or more: set, number, name, quantity.
export function guessMapping(columns: number): Mapping {
  if (columns >= 4) return { set: 0, no: 1, name: 2, qty: 3 };
  if (columns === 3) return { no: 0, name: 1, qty: 2 };
  return { no: 0, name: 1 };
}

// ---------- fingerprint ----------

// A SHA-256 of the normalized rows, so the same content cannot be committed twice.
export async function fingerprint(rows: Row[]): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify(rows.map((r) => r.r)));
  const hash = await globalThis.crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const sourceOfName = (name: string): Source => (/\.xlsx$/i.test(name) ? "xlsx" : /\.tsv$/i.test(name) ? "tsv" : "csv");
