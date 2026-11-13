// Intelligent Import: a small model suggests the role of each column. These are the checks that every suggestion must pass before it is shown,
// so a wrong or invented answer can never become anything but a choice the user sees and can change.

export const HINT_ROLES = ["", "set", "year", "code", "section", "no", "name", "team", "qty", "have", "parallel", "serial", "status", "flag"] as const;
export type HintRole = (typeof HINT_ROLES)[number];

// Roles that can only belong to one column. "flag" (a parallel named by its heading) and "" (ignore) may be used many times.
const SINGLE = new Set<string>(HINT_ROLES.filter((r) => r !== "" && r !== "flag"));

export const HINT_LIMITS = { columns: 60, rows: 8, cell: 60 } as const;

// What is sent to the model: the headings and a few rows, each cell cut short. Nothing else from the file leaves the device.
export function sampleForHint(table: string[][], hasHeader: boolean): { headers: string[]; rows: string[][] } {
  const width = Math.min(HINT_LIMITS.columns, Math.max(0, ...table.slice(0, 50).map((r) => r.length)));
  const cut = (r: string[]) => Array.from({ length: width }, (_, i) => (r[i] ?? "").slice(0, HINT_LIMITS.cell));
  const headers = hasHeader ? cut(table[0] || []) : Array.from({ length: width }, (_, i) => `col${i + 1}`);
  const body = hasHeader ? table.slice(1) : table;
  return { headers, rows: body.slice(0, HINT_LIMITS.rows).map(cut) };
}

// The model's answer to a list of roles, one per column. Anything that is not an allowed role becomes "ignore"; a role that can only be used once
// keeps its first column. Returns null when the answer is not a list of the right length.
export function cleanRoles(input: unknown, width: number): HintRole[] | null {
  if (!Array.isArray(input) || input.length !== width) return null;
  const used = new Set<string>();
  return input.map((v) => {
    const r = typeof v === "string" ? v : "";
    if (!(HINT_ROLES as readonly string[]).includes(r)) return "";
    if (SINGLE.has(r)) {
      if (used.has(r)) return "";
      used.add(r);
    }
    return r as HintRole;
  });
}
