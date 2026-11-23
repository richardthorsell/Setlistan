// Run with: npm test (Node 22.6+ strips the types, no extra dependencies).
import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_LINES, parseCardLines, summarize } from "./cardreport.ts";

test("parseCardLines: number and name, name only, number only", () => {
  const { lines } = parseCardLines("12 Peter Forsberg\nPeter Forsberg\nBC-244");
  assert.deepEqual(lines, [
    { no: "12", name: "Peter Forsberg" },
    { no: null, name: "Peter Forsberg" },
    { no: "BC-244", name: null },
  ]);
});

test("parseCardLines: hash, colon and dash are cleaned away", () => {
  const { lines } = parseCardLines("#7: Sundin\n8. - Lidström");
  assert.deepEqual(lines, [{ no: "7", name: "Sundin" }, { no: "8", name: "Lidström" }]);
});

test("parseCardLines: empty lines are skipped and spaces are collapsed", () => {
  const { lines, tooMany } = parseCardLines("\n  3    Foppa  \n\n   \r\n4\n");
  assert.deepEqual(lines, [{ no: "3", name: "Foppa" }, { no: "4", name: null }]);
  assert.equal(tooMany, false);
});

test("parseCardLines: an empty text gives nothing", () => {
  assert.deepEqual(parseCardLines("").lines, []);
  assert.deepEqual(parseCardLines("   \n \n").lines, []);
});

test("parseCardLines: more than the maximum is cut and flagged", () => {
  const text = Array.from({ length: MAX_LINES + 5 }, (_, i) => `${i + 1} Kort`).join("\n");
  const r = parseCardLines(text);
  assert.equal(r.lines.length, MAX_LINES);
  assert.equal(r.tooMany, true);
});

test("parseCardLines: long names and numbers are cut to what the database allows", () => {
  const r = parseCardLines(`12345678901 ${"x".repeat(300)}\n${"y".repeat(300)}`);
  assert.equal(r.lines[0].name?.length, 120);
  assert.equal(r.lines[1].name?.length, 120);
  assert.ok((r.lines[0].no ?? "").length <= 20);
});

test("summarize: counts every answer and notices the daily limit", () => {
  assert.deepEqual(summarize(["ok", "ok", "duplicate", "limit", "off"]), { ok: 2, duplicate: 1, failed: 2, limit: true });
  assert.deepEqual(summarize([]), { ok: 0, duplicate: 0, failed: 0, limit: false });
});
