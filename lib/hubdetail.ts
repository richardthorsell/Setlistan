import type { SupabaseClient } from "@supabase/supabase-js";

// Details for the Hub's own page for Setlistan (richardthorsell/hub). Counts and sums only: never names, e-mail addresses,
// what anyone owns, or any single person's activity. Everything lives in this one file so it can be unit-tested with node
// (this repo's tsconfig does not allow importing .ts files from each other). The helpers mirror the ones in Pluggasmartare.

export type HubUnit = "count" | "usd" | "percent";
export type HubPoint = { date: string; value: number };
export type HubSeries = { id: string; label: string; unit: HubUnit; points: HubPoint[] };
export type HubItem = { label: string; value: number };
export type HubBreakdown = {
  id: string;
  label: string;
  unit: HubUnit;
  /** "funnel" is drawn as steps where each step is a subset of the previous one. */
  kind: "distribution" | "funnel";
  items: HubItem[];
};
export type HubMetric = { label: string; value: number; unit: HubUnit };
export type HubDetail = {
  metrics: HubMetric[];
  series: HubSeries[];
  breakdowns: HubBreakdown[];
  /** Parts that could not be read, so the Hub can say so instead of showing 0. */
  unavailable: string[];
};

const TZ = "Europe/Stockholm";
const DAY = 86_400_000;
const PAGE = 1000;
const MAX_PAGES = 20; // at most 20,000 rows per query, otherwise "could not read" rather than a silently cut-off number
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** A date as YYYY-MM-DD in Swedish time. */
export function dayKey(date: Date | string | number, tz = TZ): string {
  const d = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** The last `days` days, oldest first, today last. */
export function lastDayKeys(days: number, now = new Date(), tz = TZ): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  // Step back 24 hours at a time. Around a daylight-saving change two steps can land on the same day, hence the dedupe.
  for (let i = 0; seen.size < days && i < days + 3; i++) {
    const k = dayKey(new Date(now.getTime() - i * DAY), tz);
    if (!seen.has(k)) {
      seen.add(k);
      keys.push(k);
    }
  }
  return keys.reverse();
}

/** Number of events per day. Events outside the period are ignored. */
export function bucketCounts(timestamps: string[], days: string[], tz = TZ): HubPoint[] {
  const counts = new Map(days.map((d) => [d, 0]));
  for (const t of timestamps) {
    const k = dayKey(t, tz);
    if (counts.has(k)) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return days.map((date) => ({ date, value: counts.get(date) ?? 0 }));
}

/** Sum per day, for example cost. */
export function bucketSums(rows: { at: string; value: number }[], days: string[], tz = TZ): HubPoint[] {
  const sums = new Map(days.map((d) => [d, 0]));
  for (const r of rows) {
    const k = dayKey(r.at, tz);
    if (sums.has(k)) sums.set(k, (sums.get(k) ?? 0) + (Number.isFinite(r.value) ? r.value : 0));
  }
  return days.map((date) => ({ date, value: round4(sums.get(date) ?? 0) }));
}

export function sumPoints(points: HubPoint[]): number {
  return round4(points.reduce((n, p) => n + p.value, 0));
}

/** Counts per label, largest first. */
export function countBy<T>(rows: T[], label: (row: T) => string | null | undefined): HubItem[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const l = label(r);
    if (l) map.set(l, (map.get(l) ?? 0) + 1);
  }
  return [...map.entries()].map(([l, value]) => ({ label: l, value })).sort((a, b) => b.value - a.value);
}

/** Steps where each is a subset of the previous. Counts unique ids per step. */
export function buildFunnel(steps: { label: string; ids: Set<string> }[]): HubItem[] {
  const out: HubItem[] = [];
  let previous: Set<string> | null = null;
  for (const step of steps) {
    const ids: Set<string> = previous ? new Set([...step.ids].filter((id) => previous!.has(id))) : step.ids;
    out.push({ label: step.label, value: ids.size });
    previous = ids;
  }
  return out;
}

type Page<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

/** Reads a table page by page. Returns null on error or when there is an implausible amount of data. */
export async function fetchAll<T>(page: (from: number, to: number) => Page<T>): Promise<T[] | null> {
  const rows: T[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const { data, error } = await page(i * PAGE, i * PAGE + PAGE - 1);
    if (error || !data) return null;
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
  return null;
}

type AuthPerson = { id: string; created_at: string; last_sign_in_at: string | null };

/** Accounts, page by page. Only ids and timestamps are kept, and only counts ever leave this file. */
async function listAccounts(admin: SupabaseClient): Promise<AuthPerson[] | null> {
  const people: AuthPerson[] = [];
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data) return null;
    for (const u of data.users) {
      people.push({ id: u.id, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at ?? null });
    }
    if (data.users.length < 1000) return people;
  }
  return null;
}

const STATUS: Record<string, string> = { done: "Klara", failed: "Misslyckade", running: "Pågår" };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export async function loadHubDetail(admin: SupabaseClient, now = new Date()): Promise<HubDetail> {
  const unavailable: string[] = [];
  const days = lastDayKeys(30, now);
  const since = new Date(now.getTime() - 32 * DAY).toISOString();
  const since24h = now.getTime() - DAY;
  const since30 = now.getTime() - 30 * DAY;
  const month = dayKey(now).slice(0, 7); // "2026-11"
  const head = { count: "exact" as const, head: true };

  const [people, owned, jobs, tradera, sets, setCount, cardCount, waiting, feedbackOpen, suggestionsNew] = await Promise.all([
    listAccounts(admin),
    fetchAll<{ user_id: string; created_at: string }>((a, b) =>
      admin.from("owned").select("user_id, created_at").order("created_at").order("user_id").order("card_id").range(a, b),
    ),
    fetchAll<{ created_at: string; status: string; cost_usd: number | string }>((a, b) =>
      admin.from("fetch_jobs").select("created_at, status, cost_usd").gte("created_at", since).order("id").range(a, b),
    ),
    fetchAll<{ created_at: string }>((a, b) =>
      admin.from("tradera_calls").select("created_at").gte("created_at", since).order("id").range(a, b),
    ),
    fetchAll<{ sport: string | null }>((a, b) => admin.from("sets").select("sport").order("id").range(a, b)),
    admin.from("sets").select("id", head),
    // The card library is large (over a million rows). An estimate is fast and good enough for a "roughly" figure.
    admin.from("cards").select("id", { count: "estimated" as const, head: true }),
    admin.from("waitlist").select("id", head).is("invited_at", null),
    admin.from("feedback").select("id", head).is("handled_at", null),
    admin.from("set_suggestions").select("id", head).eq("status", "ny"),
  ]);

  const metrics: HubMetric[] = [];
  const series: HubSeries[] = [];
  const breakdowns: HubBreakdown[] = [];

  // Key figures
  if (people) {
    metrics.push({ label: "Användare", value: people.length, unit: "count" });
    metrics.push({
      label: "Aktiva senaste 30 dagarna",
      value: people.filter((p) => p.last_sign_in_at && Date.parse(p.last_sign_in_at) >= since30).length,
      unit: "count",
    });
  } else unavailable.push("användare");
  if (owned) {
    metrics.push({ label: "Samlare", value: new Set(owned.map((o) => o.user_id)).size, unit: "count" });
    metrics.push({ label: "Kort som ägs", value: owned.length, unit: "count" });
  } else unavailable.push("samlingar");
  if (!setCount.error) metrics.push({ label: "Set i biblioteket", value: setCount.count ?? 0, unit: "count" });
  else unavailable.push("set");
  if (!cardCount.error && cardCount.count !== null) {
    metrics.push({ label: "Kort i biblioteket (ungefär)", value: cardCount.count, unit: "count" });
  } else unavailable.push("kort i biblioteket");
  if (jobs) {
    const recent = jobs.filter((j) => Date.parse(j.created_at) >= since30);
    metrics.push({ label: "Hämtningar, 30 dagar", value: recent.length, unit: "count" });
    metrics.push({ label: "Misslyckade hämtningar, 30 dagar", value: recent.filter((j) => j.status === "failed").length, unit: "count" });
    metrics.push({
      label: "Hämtningskostnad i månaden",
      value: round4(jobs.filter((j) => dayKey(j.created_at).startsWith(month)).reduce((n, j) => n + (Number(j.cost_usd) || 0), 0)),
      unit: "usd",
    });
  } else unavailable.push("hämtningar");
  if (tradera) {
    metrics.push({
      label: "Tradera-anrop senaste dygnet (gräns 100)",
      value: tradera.filter((t) => Date.parse(t.created_at) >= since24h).length,
      unit: "count",
    });
  } else unavailable.push("Tradera");
  if (!waiting.error) metrics.push({ label: "På väntelistan", value: waiting.count ?? 0, unit: "count" });
  else unavailable.push("väntelista");
  if (!feedbackOpen.error) metrics.push({ label: "Obehandlad feedback", value: feedbackOpen.count ?? 0, unit: "count" });
  else unavailable.push("feedback");
  if (!suggestionsNew.error) metrics.push({ label: "Nya setförslag", value: suggestionsNew.count ?? 0, unit: "count" });
  else unavailable.push("setförslag");

  // Development per day
  if (people) {
    series.push({ id: "anvandare", label: "Nya användare per dag", unit: "count", points: bucketCounts(people.map((p) => p.created_at), days) });
  }
  if (owned) {
    series.push({ id: "kort", label: "Kort tillagda per dag", unit: "count", points: bucketCounts(owned.map((o) => o.created_at), days) });
  }
  if (jobs) {
    series.push({ id: "hamtningar", label: "Hämtningar per dag", unit: "count", points: bucketCounts(jobs.map((j) => j.created_at), days) });
    series.push({
      id: "hamtningskostnad",
      label: "Hämtningskostnad per dag",
      unit: "usd",
      points: bucketSums(jobs.map((j) => ({ at: j.created_at, value: Number(j.cost_usd) || 0 })), days),
    });
  }
  if (tradera) {
    series.push({ id: "tradera", label: "Tradera-anrop per dag", unit: "count", points: bucketCounts(tradera.map((t) => t.created_at), days) });
  }

  // Distributions
  if (jobs) {
    const items = countBy(
      jobs.filter((j) => Date.parse(j.created_at) >= since30),
      (j) => STATUS[j.status] ?? cap(j.status),
    );
    if (items.length > 0) {
      breakdowns.push({ id: "hamtningar-status", label: "Hämtningar per status, 30 dagar", unit: "count", kind: "distribution", items });
    }
  }
  if (sets) {
    const items = countBy(sets, (s) => (s.sport ? cap(s.sport) : "Okänd sport"));
    if (items.length > 0) {
      breakdowns.push({ id: "set-sport", label: "Set i biblioteket per sport", unit: "count", kind: "distribution", items: items.slice(0, 30) });
    }
  }
  if (people && owned) {
    breakdowns.push({
      id: "trappa",
      label: "Så långt har användarna kommit",
      unit: "count",
      kind: "funnel",
      items: buildFunnel([
        { label: "Användare", ids: new Set(people.map((p) => p.id)) },
        { label: "Har lagt till kort", ids: new Set(owned.map((o) => o.user_id)) },
        {
          label: "Har lagt till kort senaste 30 dagarna",
          ids: new Set(owned.filter((o) => Date.parse(o.created_at) >= since30).map((o) => o.user_id)),
        },
      ]),
    });
  }

  return { metrics, series, breakdowns, unavailable };
}

/** Cards added per day over the last 14 days, for the small trend line on the Hub's overview. Null if it could not be read. */
export async function loadTrend(
  admin: SupabaseClient,
  now = new Date(),
): Promise<{ label: string; values: number[] } | null> {
  const days = lastDayKeys(14, now);
  const since = new Date(now.getTime() - 16 * DAY).toISOString();
  const rows = await fetchAll<{ created_at: string }>((a, b) =>
    admin
      .from("owned")
      .select("created_at")
      .gte("created_at", since)
      .order("created_at")
      .order("user_id")
      .order("card_id")
      .range(a, b),
  );
  if (!rows) return null;
  return { label: "Kort tillagda per dag", values: bucketCounts(rows.map((r) => r.created_at), days).map((p) => p.value) };
}
