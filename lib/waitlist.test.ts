import { test } from "node:test";
import assert from "node:assert/strict";
import { validName } from "./waitlist.ts";

test("validName: ordinary names are accepted", () => {
  for (const n of ["Richard Thorsell", "Åsa Öberg-Lind", "O'Brien", "J.R. Smith", "Zoë", "Anna-Karin Svensson"]) assert.equal(validName(n), true, n);
});

test("validName: links, digits and symbols are refused", () => {
  for (const n of ["Buy pills http://x.co", "Visit www.evil.com", "evil.com", "Agent 007", "a@b.se", "<b>Hej</b>", "", "x".repeat(61)]) assert.equal(validName(n), false, n);
});
