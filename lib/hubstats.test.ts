import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSnapshot, type HubCounts } from "./hubstats.ts";

const base: HubCounts = {
  users: 34,
  activeUsers: 11,
  costMonthUsd: 1.234,
  failedFetches24h: 0,
  waiting: 0,
  feedbackOpen: 0,
  suggestionsNew: 0,
  failed: [],
};

test("calm: healthy and nothing needs attention", () => {
  const s = buildSnapshot(base);
  assert.equal(s.health, "ok");
  assert.deepEqual(s.attention, []);
  assert.equal(s.costMonthUsd, 1.23);
});

test("a few failed fetches are info, many are a warning", () => {
  const few = buildSnapshot({ ...base, failedFetches24h: 2 });
  assert.equal(few.health, "ok");
  assert.equal(few.attention[0].level, "info");
  const many = buildSnapshot({ ...base, failedFetches24h: 5 });
  assert.equal(many.health, "warn");
  assert.equal(many.attention[0].level, "warn");
});

test("parts that could not be read give a warning and a critical notice", () => {
  const s = buildSnapshot({ ...base, failed: ["användare"] });
  assert.equal(s.health, "warn");
  assert.equal(s.attention[0].level, "critical");
});

test("waitlist, feedback and suggestions become notices with correct plural", () => {
  const s = buildSnapshot({ ...base, waiting: 1, feedbackOpen: 3, suggestionsNew: 1 });
  const texts = s.attention.map((a) => a.text);
  assert.ok(texts.includes("1 person på väntelistan"));
  assert.ok(texts.includes("3 feedback att hantera"));
  assert.ok(texts.includes("1 nytt setförslag"));
});

test("the answer holds only numbers and short texts, no personal data", () => {
  const json = JSON.stringify(buildSnapshot({ ...base, waiting: 5 }));
  assert.ok(!/@|epost|e-post|email/i.test(json));
});
