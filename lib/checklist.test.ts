// Run with: npm test (Node 22.6+ strips the types, no extra dependencies).
import { test } from "node:test";
import assert from "node:assert/strict";
import { dedupeTokens, parsePaste, quickIds, type Section } from "./checklist.ts";

const cards = (text: string) => parsePaste(text).flatMap((s) => s.cards.map((c) => ({ code: s.code, ...c })));

test("parsePaste: basic lines, separators and rookie marker", () => {
  const out = cards("1 Max Dowman, Arsenal\n2 Cole Palmer - Chelsea RC\nBM 3 | Some Player | Club");
  assert.deepEqual(out, [
    { code: "", no: 1, name: "Max Dowman", team: "Arsenal", tags: [] },
    { code: "", no: 2, name: "Cole Palmer", team: "Chelsea", tags: ["RC"] },
    { code: "BM", no: 3, name: "Some Player", team: "Club", tags: [] },
  ]);
});

test("parsePaste: a club called RC Lens is not a rookie marker", () => {
  const out = cards("7 Elye Wahi, RC Lens\n8 Player Name - RC Strasbourg");
  assert.deepEqual(out.map((c) => [c.name, c.team, c.tags]), [
    ["Elye Wahi", "RC Lens", []],
    ["Player Name", "RC Strasbourg", []],
  ]);
});

test("parsePaste: (RC) in brackets and rookie as last word", () => {
  const out = cards("1 Player One (RC), Club A\n2 Player Two, Club B rookie\n3 Player Three, Club C | RC");
  assert.deepEqual(out.map((c) => [c.name, c.team, c.tags]), [
    ["Player One", "Club A", ["RC"]],
    ["Player Two", "Club B", ["RC"]],
    ["Player Three", "Club C", ["RC"]],
  ]);
});

test("parsePaste: codes ending in a digit", () => {
  const out = cards("SBC2 271 Some Player, Club\nBM12 Other Player, Club\nBM1 Third Player, Club");
  assert.deepEqual(out.map((c) => [c.code, c.no, c.name]), [
    ["SBC2", 271, "Some Player"],
    ["BM", 1, "Third Player"],
    ["BM", 12, "Other Player"],
  ]);
});

test("parsePaste: headings and totals are not cards", () => {
  const out = cards("2024 Topps Chrome Premier League\nTotal 100 cards\nPage 12 of 40\n1 A Player, Club");
  assert.deepEqual(out.map((c) => [c.code, c.no, c.name]), [["", 1, "A Player"]]);
});

test("parsePaste: a year-like number with a team is still a card", () => {
  assert.equal(cards("2024 Joe Smith, Club").length, 1);
});

const sec = (code: string, from: number, to: number, id0: number): Section => ({
  id: id0,
  code,
  name: code || "Base",
  position: 0,
  cards: Array.from({ length: to - from + 1 }, (_, i) => ({ id: id0 * 1000 + from + i, section_id: id0, no: from + i, name: "x", team: "", tags: [] })),
});

test("quickIds: overlapping ranges count each card once", () => {
  const { ids, bad } = quickIds([sec("", 1, 20, 1)], "1-10, 5");
  assert.equal(ids.length, 10);
  assert.deepEqual(bad, []);
});

test("quickIds: section codes, including one that ends in a digit", () => {
  const sections = [sec("", 1, 5, 1), sec("BM", 1, 5, 2), sec("SBC2", 271, 275, 3)];
  assert.equal(quickIds(sections, "BM 1-3").ids.length, 3);
  assert.equal(quickIds(sections, "SBC2 271-273").ids.length, 3);
  assert.deepEqual(quickIds(sections, "ZZ 1").bad, ["ZZ 1"]);
});

test("dedupeTokens: a single year does not match the season that ends in it", () => {
  const have = new Set(dedupeTokens("Topps Chrome Premier League 2025/26"));
  const hit = (q: string) => dedupeTokens(q).every((w) => have.has(w));
  assert.equal(hit("Topps Chrome 2026"), false);
  assert.equal(hit("Topps Chrome 2026/27"), false);
  assert.equal(hit("Topps Chrome 2025/26"), true);
  assert.equal(hit("Topps Chrome 25/26"), true);
  assert.equal(hit("Topps Chrome 2025"), true);
  assert.equal(hit("Topps Chrome Premier League"), true);
});
