// Run with: npm test (Node 22.6+ strips the types, no extra dependencies).
import { test } from "node:test";
import assert from "node:assert/strict";
import { type PulseItem, describe, nextBest, splitFeed } from "./pulse.ts";

const mk = (over: Partial<PulseItem>): PulseItem => ({ id: 1, kind: "almost", status: "new", score: 70, created_at: "2026-11-16T10:00:00Z", expires_at: null, ref: {}, ...over });

test("describe: almost complete shows the numbers and links to the set", () => {
  const d = describe(mk({ ref: { set_id: "s1", set_name: "Parkhurst", have: 96, total: 100 } }));
  assert.equal(d.title, "Nästan komplett");
  assert.equal(d.name, "Parkhurst");
  assert.equal(d.facts, "96/100 · 96 %");
  assert.equal(d.action, "set");
  assert.equal(d.setId, "s1");
});

test("describe: a set that no longer has a name still gets its id, and an empty reference does not crash", () => {
  assert.equal(describe(mk({ ref: { set_id: "abc" } })).name, "abc");
  const d = describe(mk({ kind: "almost", ref: {} }));
  assert.equal(d.action, "none");
  assert.equal(d.facts, "0/0 · 0 %");
});

test("describe: milestones, new set and trade", () => {
  assert.equal(describe(mk({ kind: "milestone", ref: { what: "cards", n: 100 } })).facts, "100");
  assert.equal(describe(mk({ kind: "milestone", ref: { what: "first_complete" } })).title, "Ditt första kompletta set");
  assert.equal(describe(mk({ kind: "newset", ref: { set_id: "n1", set_name: "Upper Deck", year: 2026 } })).facts, "2026");
  const t = describe(mk({ kind: "trade", ref: { alias: "Anna", receive_n: 3, give_n: 2 } }));
  assert.equal(t.action, "trade");
  assert.equal(t.facts, "3 ⇄ 2");
});

test("describe: wrong types in the reference are ignored", () => {
  const d = describe(mk({ ref: { set_id: 5, have: "x", total: null } }));
  assert.equal(d.setId, null);
  assert.equal(d.facts, "0/0 · 0 %");
});

test("splitFeed: new and seen opportunities are current, milestones that were seen, dismissed and expired are history", () => {
  const items = [
    mk({ id: 1, status: "new" }),
    mk({ id: 2, status: "seen" }),
    mk({ id: 3, kind: "milestone", status: "seen" }),
    mk({ id: 4, status: "dismissed" }),
    mk({ id: 5, status: "expired" }),
    mk({ id: 6, kind: "milestone", status: "new" }),
  ];
  const { current, history } = splitFeed(items);
  assert.deepEqual(current.map((i) => i.id), [1, 2, 6]);
  assert.deepEqual(history.map((i) => i.id), [3, 4, 5]);
});

test("nextBest: the highest score among the new ones wins, and an empty feed gives nothing", () => {
  assert.equal(nextBest([]), null);
  const items = [mk({ id: 1, score: 50 }), mk({ id: 2, score: 90 }), mk({ id: 3, score: 99, status: "seen" })];
  assert.equal(nextBest(items)?.id, 2);
  assert.equal(nextBest([mk({ id: 3, score: 40, status: "seen" })])?.id, 3);
  assert.equal(nextBest([mk({ id: 4, status: "dismissed" })]), null);
});
