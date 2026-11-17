import type { SupabaseClient } from "@supabase/supabase-js";

// Numbers for the Hub (richardthorsell/hub), Richard's shared admin page.
// Counts only: never names, e-mail addresses, collections or what anyone owns.

export type HubAttention = { text: string; level: "info" | "warn" | "critical"; href?: string };

export type HubSnapshot = {
  health: "ok" | "warn" | "down";
  users: number;
  activeUsers: number;
  costMonthUsd: number;
  attention: HubAttention[];
};

export type HubCounts = {
  users: number;
  activeUsers: number;
  costMonthUsd: number;
  failedFetches24h: number;
  waiting: number;
  feedbackOpen: number;
  suggestionsNew: number;
  /** Names of parts that could not be read. */
  failed: string[];
};

// This many failed fetches in a day count as a warning about the service's health.
const FAILED_WARN = 5;

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Turns raw counts into what the Hub shows. A pure function, tested in lib/hubstats.test.ts. */
export function buildSnapshot(c: HubCounts): HubSnapshot {
  const attention: HubAttention[] = [];
  if (c.failed.length > 0) {
    attention.push({ text: `Kunde inte läsa: ${c.failed.join(", ")}`, level: "critical", href: "/admin" });
  }
  if (c.failedFetches24h > 0) {
    attention.push({
      text: `${n(c.failedFetches24h, "misslyckad hämtning", "misslyckade hämtningar")} senaste dygnet`,
      level: c.failedFetches24h >= FAILED_WARN ? "warn" : "info",
      href: "/admin",
    });
  }
  if (c.feedbackOpen > 0) {
    attention.push({ text: `${n(c.feedbackOpen, "feedback", "feedback")} att hantera`, level: "info", href: "/admin" });
  }
  if (c.suggestionsNew > 0) {
    attention.push({
      text: `${n(c.suggestionsNew, "nytt setförslag", "nya setförslag")}`,
      level: "info",
      href: "/admin",
    });
  }
  if (c.waiting > 0) {
    attention.push({ text: `${n(c.waiting, "person", "personer")} på väntelistan`, level: "info", href: "/admin" });
  }
  return {
    health: c.failed.length > 0 || c.failedFetches24h >= FAILED_WARN ? "warn" : "ok",
    users: c.users,
    activeUsers: c.activeUsers,
    costMonthUsd: Math.round(c.costMonthUsd * 100) / 100,
    attention,
  };
}

const DAY = 86_400_000;

async function count(
  failed: string[],
  name: string,
  query: PromiseLike<{ count: number | null; error: unknown }>,
): Promise<number> {
  const { count: total, error } = await query;
  if (error) {
    failed.push(name);
    return 0;
  }
  return total ?? 0;
}

// Sums the cost page by page, so the answer is never silently cut off at 1,000 rows.
async function monthCostUsd(admin: SupabaseClient, since: string): Promise<number | null> {
  const PAGE = 1000;
  let total = 0;
  for (let page = 0; page < 100; page++) {
    const { data, error } = await admin
      .from("fetch_jobs")
      .select("cost_usd")
      .gte("created_at", since)
      .order("id", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) return null;
    for (const row of data ?? []) total += Number(row.cost_usd) || 0;
    if ((data?.length ?? 0) < PAGE) return total;
  }
  return null; // implausibly many rows: better "could not read" than a wrong amount
}

// Counts accounts and recent sign-ins. Only the counts leave this function.
async function userCounts(admin: SupabaseClient, now: Date): Promise<{ users: number; active: number } | null> {
  const PER_PAGE = 1000;
  const since = now.getTime() - 30 * DAY;
  let users = 0;
  let active = 0;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) return null;
    for (const u of data.users) {
      users++;
      if (u.last_sign_in_at && Date.parse(u.last_sign_in_at) >= since) active++;
    }
    if (data.users.length < PER_PAGE) return { users, active };
  }
  return null;
}

export async function loadHubSnapshot(admin: SupabaseClient, now = new Date()): Promise<HubSnapshot> {
  const failed: string[] = [];
  const head = { count: "exact" as const, head: true };
  const since24h = new Date(now.getTime() - DAY).toISOString();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  const [accounts, failedFetches24h, waiting, feedbackOpen, suggestionsNew, cost] = await Promise.all([
    userCounts(admin, now),
    count(failed, "hämtningar", admin.from("fetch_jobs").select("id", head).eq("status", "failed").gte("created_at", since24h)),
    count(failed, "väntelista", admin.from("waitlist").select("id", head).is("invited_at", null)),
    count(failed, "feedback", admin.from("feedback").select("id", head).is("handled_at", null)),
    count(failed, "setförslag", admin.from("set_suggestions").select("id", head).eq("status", "ny")),
    monthCostUsd(admin, monthStart),
  ]);

  if (accounts === null) failed.push("användare");
  if (cost === null) failed.push("AI-kostnad");

  return buildSnapshot({
    users: accounts?.users ?? 0,
    activeUsers: accounts?.active ?? 0,
    costMonthUsd: cost ?? 0,
    failedFetches24h,
    waiting,
    feedbackOpen,
    suggestionsNew,
    failed,
  });
}
