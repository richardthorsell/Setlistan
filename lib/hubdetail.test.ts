import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  bucketCounts,
  bucketSums,
  buildFunnel,
  countBy,
  dayKey,
  lastDayKeys,
  loadHubDetail,
  loadTrend,
  sumPoints,
} from "./hubdetail.ts";

// A fake Supabase that understands exactly the queries loadHubDetail asks: select, gte, eq, is, order, range and head counts.
type Row = Record<string, unknown>;

function fakeAdmin(tables: Record<string, Row[] | "error">, users: Row[] | "error" = []): SupabaseClient {
  return {
    from(table: string) {
      let cols = "";
      let head = false;
      const filters: ((r: Row) => boolean)[] = [];
      let range: [number, number] | null = null;
      const run = () => {
        const source = tables[table];
        if (source === "error" || source === undefined) return { data: null, count: null, error: { message: "boom" } };
        const rows = source.filter((r) => filters.every((f) => f(r)));
        if (head) return { data: null, count: rows.length, error: null };
        const out = range ? rows.slice(range[0], range[1] + 1) : rows;
        const wanted = cols.split(",").map((c) => c.trim());
        return { data: out.map((r) => Object.fromEntries(wanted.map((c) => [c, r[c]]))), count: null, error: null };
      };
      const q: Record<string, unknown> = {
        select(c: string, opts?: { head?: boolean }) {
          cols = c;
          head = Boolean(opts?.head);
          return q;
        },
        gte(col: string, v: string) {
          filters.push((r) => typeof r[col] === "string" && (r[col] as string) >= v);
          return q;
        },
        eq(col: string, v: unknown) {
          filters.push((r) => r[col] === v);
          return q;
        },
        is(col: string, v: null) {
          filters.push((r) => (r[col] ?? null) === v);
          return q;
        },
        order: () => q,
        range(a: number, b: number) {
          range = [a, b];
          return q;
        },
        then: (resolve: (v: unknown) => unknown) => resolve(run()),
      };
      return q;
    },
    auth: {
      admin: {
        listUsers: async () => (users === "error" ? { data: null, error: { message: "boom" } } : { data: { users }, error: null }),
      },
    },
  } as unknown as SupabaseClient;
}

const NOW = new Date("2026-11-18T10:00:00Z");
const d = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString();

const fixtures = () => ({
  tables: {
    owned: [
      { user_id: "u1", card_id: 1, created_at: d(1) },
      { user_id: "u1", card_id: 2, created_at: d(1) },
      { user_id: "u2", card_id: 3, created_at: d(40) }, // older than 30 days
      { user_id: "u3", card_id: 4, created_at: d(0) },
    ],
    fetch_jobs: [
      { id: 1, created_at: d(1), status: "done", cost_usd: "0.2" },
      { id: 2, created_at: d(2), status: "failed", cost_usd: "0.1" },
      { id: 3, created_at: d(20), status: "done", cost_usd: "5" }, // last month
    ],
    tradera_calls: [{ id: 1, created_at: d(0) }, { id: 2, created_at: d(3) }],
    sets: [{ sport: "ishockey" }, { sport: "ishockey" }, { sport: "fotboll" }, { sport: null }],
    cards: new Array(7).fill({ id: 1 }),
    waitlist: [{ invited_at: null }, { invited_at: d(1) }],
    feedback: [{ handled_at: null }, { handled_at: null }, { handled_at: d(1) }],
    set_suggestions: [{ status: "ny" }, { status: "klar" }],
  } as Record<string, Row[] | "error">,
  users: [
    { id: "u1", created_at: d(2), last_sign_in_at: d(1) },
    { id: "u2", created_at: d(10), last_sign_in_at: d(90) },
    { id: "u3", created_at: d(0), last_sign_in_at: null },
    { id: "u4", created_at: d(60), last_sign_in_at: d(40) },
  ] as Row[],
});

test("day helpers use Swedish time and never produce duplicates", () => {
  assert.equal(dayKey("2026-11-17T23:30:00Z"), "2026-11-18");
  assert.equal(dayKey("2026-07-01T22:30:00Z"), "2026-07-02");
  const days = lastDayKeys(7, NOW);
  assert.deepEqual([days[0], days[6]], ["2026-11-12", "2026-11-18"]);
  assert.equal(new Set(lastDayKeys(10, new Date("2026-10-27T10:00:00Z"))).size, 10); // daylight-saving change
});

test("buckets count and sum per day and drop floating-point noise", () => {
  const days = lastDayKeys(3, NOW);
  assert.deepEqual(
    bucketCounts(["2026-11-18T08:00:00Z", "2026-11-16T12:00:00Z", "2026-10-01T12:00:00Z"], days).map((p) => p.value),
    [1, 0, 1],
  );
  const sums = bucketSums([{ at: "2026-11-18T08:00:00Z", value: 0.1 }, { at: "2026-11-18T09:00:00Z", value: 0.2 }], days);
  assert.equal(sums[2].value, 0.3);
  assert.equal(sumPoints(sums), 0.3);
});

test("countBy and buildFunnel", () => {
  assert.deepEqual(countBy([{ k: "a" }, { k: "b" }, { k: "a" }, { k: null }], (r) => r.k), [
    { label: "a", value: 2 },
    { label: "b", value: 1 },
  ]);
  const funnel = buildFunnel([
    { label: "x", ids: new Set(["a", "b", "c"]) },
    { label: "y", ids: new Set(["a", "b", "z"]) }, // z is not in the first step
    { label: "z", ids: new Set(["a"]) },
  ]);
  assert.deepEqual(funnel.map((i) => i.value), [3, 2, 1]);
});

test("the details are computed correctly from known rows", async () => {
  const f = fixtures();
  const detail = await loadHubDetail(fakeAdmin(f.tables, f.users), NOW);
  const metric = (label: string) => detail.metrics.find((m) => m.label === label)?.value;

  assert.equal(metric("Användare"), 4);
  assert.equal(metric("Aktiva senaste 30 dagarna"), 1); // only u1 signed in within 30 days
  assert.equal(metric("Samlare"), 3);
  assert.equal(metric("Kort som ägs"), 4);
  assert.equal(metric("Set i biblioteket"), 4);
  assert.equal(metric("Kort i biblioteket (ungefär)"), 7);
  assert.equal(metric("Hämtningar, 30 dagar"), 3);
  assert.equal(metric("Misslyckade hämtningar, 30 dagar"), 1);
  assert.equal(metric("Hämtningskostnad i månaden"), 0.3); // 5 USD is from last month
  assert.equal(metric("Tradera-anrop senaste dygnet (gräns 100)"), 1);
  assert.equal(metric("På väntelistan"), 1);
  assert.equal(metric("Obehandlad feedback"), 2);
  assert.equal(metric("Nya setförslag"), 1);
  assert.deepEqual(detail.unavailable, []);

  const funnel = detail.breakdowns.find((b) => b.id === "trappa");
  // users 4 -> have cards (u1,u2,u3) 3 -> added in last 30 days (u1,u3) 2
  assert.deepEqual(funnel?.items.map((i) => i.value), [4, 3, 2]);

  assert.deepEqual(detail.breakdowns.find((b) => b.id === "set-sport")?.items, [
    { label: "Ishockey", value: 2 },
    { label: "Fotboll", value: 1 },
    { label: "Okänd sport", value: 1 },
  ]);
  assert.deepEqual(detail.breakdowns.find((b) => b.id === "hamtningar-status")?.items, [
    { label: "Klara", value: 2 }, // the job 20 days ago is last month but still within 30 days
    { label: "Misslyckade", value: 1 },
  ]);

  const series = (id: string) => detail.series.find((s) => s.id === id)!;
  assert.equal(series("kort").points.length, 30);
  assert.equal(series("kort").points.at(-1)?.value, 1); // u3 today
  assert.equal(series("anvandare").points.reduce((n, p) => n + p.value, 0), 3); // u4 is older than 30 days
  assert.equal(series("hamtningskostnad").points.reduce((n, p) => n + p.value, 0), 5.3);
});

test("an error in one table says 'could not read' and does not take the rest down", async () => {
  const f = fixtures();
  const detail = await loadHubDetail(fakeAdmin({ ...f.tables, fetch_jobs: "error" }, f.users), NOW);
  assert.ok(detail.unavailable.includes("hämtningar"));
  assert.ok(!detail.series.some((s) => s.id === "hamtningar"));
  assert.ok(!detail.metrics.some((m) => m.label === "Hämtningskostnad i månaden"));
  assert.equal(detail.metrics.find((m) => m.label === "Användare")?.value, 4); // the rest works

  const noUsers = await loadHubDetail(fakeAdmin(f.tables, "error"), NOW);
  assert.ok(noUsers.unavailable.includes("användare"));
  assert.ok(!noUsers.breakdowns.some((b) => b.id === "trappa")); // the funnel needs both users and collections
});

test("the answer contains no ids, e-mail addresses or names", async () => {
  const f = fixtures();
  const json = JSON.stringify(await loadHubDetail(fakeAdmin(f.tables, f.users), NOW));
  assert.ok(!/u[1-4]"|@|email/i.test(json), json);
});

test("the trend is 14 daily values, oldest first", async () => {
  const f = fixtures();
  const trend = await loadTrend(fakeAdmin(f.tables, f.users), NOW);
  assert.equal(trend?.values.length, 14);
  assert.equal(trend?.values.at(-1), 1);
  assert.equal(trend?.values.at(-2), 2);
  assert.equal(await loadTrend(fakeAdmin({ owned: "error" }), NOW), null);
});
