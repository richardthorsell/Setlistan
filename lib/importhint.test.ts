// Run with: npm test (Node 22.6+ strips the types, no extra dependencies).
import { test } from "node:test";
import assert from "node:assert/strict";
import { HINT_LIMITS, cleanRoles, sampleForHint } from "./importhint.ts";

test("cleanRoles: a valid answer passes through", () => {
  assert.deepEqual(cleanRoles(["no", "section", "name", "have", "flag", "flag", ""], 7), ["no", "section", "name", "have", "flag", "flag", ""]);
});

test("cleanRoles: a role that can only be used once keeps its first column", () => {
  assert.deepEqual(cleanRoles(["name", "name", "no"], 3), ["name", "", "no"]);
});

test("cleanRoles: unknown or invented roles become ignore", () => {
  assert.deepEqual(cleanRoles(["name", "price", 5, null, "DROP TABLE"], 5), ["name", "", "", "", ""]);
});

test("cleanRoles: the wrong length or a non-list is refused", () => {
  assert.equal(cleanRoles(["name"], 2), null);
  assert.equal(cleanRoles("name", 1), null);
  assert.equal(cleanRoles(undefined, 0), null);
});

test("sampleForHint: headings and a few rows, every cell cut short", () => {
  const long = "x".repeat(500);
  const table = [["Typ", "Namn"], ...Array.from({ length: 20 }, (_, i) => [`T${i}`, long])];
  const s = sampleForHint(table, true);
  assert.deepEqual(s.headers, ["Typ", "Namn"]);
  assert.equal(s.rows.length, HINT_LIMITS.rows);
  assert.equal(s.rows[0][1].length, HINT_LIMITS.cell);
});

test("sampleForHint: without a heading row the columns get neutral names and the first row is an example", () => {
  const s = sampleForHint([["1", "A"], ["2", "B"]], false);
  assert.deepEqual(s.headers, ["col1", "col2"]);
  assert.equal(s.rows.length, 2);
});

test("sampleForHint: at most 60 columns are sent", () => {
  const s = sampleForHint([Array.from({ length: 200 }, (_, i) => `h${i}`)], true);
  assert.equal(s.headers.length, HINT_LIMITS.columns);
});
