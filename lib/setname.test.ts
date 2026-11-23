// Run with: npm test (Node 22.6+ strips the types, no extra dependencies).
import { test } from "node:test";
import assert from "node:assert/strict";
import { displayName, seriesOf, splitYear } from "./setname.ts";

test("splitYear: a season at the end or in the middle is found and taken out", () => {
  assert.deepEqual(splitYear("Upper Deck Parkhurst 1994-1995 SE"), { series: "Upper Deck Parkhurst SE", years: "1994-1995", atStart: false });
  assert.deepEqual(splitYear("Topps Chrome 2025-26"), { series: "Topps Chrome", years: "2025-26", atStart: false });
  assert.equal(splitYear("Topps PL Flagship 26/27").years, "26/27");
  assert.equal(splitYear("Score 94/95 Hockey").series, "Score Hockey");
  assert.equal(splitYear("Fleer 1994/95 Ultra").years, "1994/95");
  assert.deepEqual(splitYear("Pacific Canada Post NHL All-Stars 2003-2005"), { series: "Pacific Canada Post NHL All-Stars", years: "2003-2005", atStart: false });
});

test("splitYear: a year at the start is recognised as already first", () => {
  const r = splitYear("1994-95 Upper Deck");
  assert.equal(r.atStart, true);
  assert.equal(r.series, "Upper Deck");
});

test("splitYear: a single year, also in brackets", () => {
  assert.deepEqual(splitYear("Topps Chrome (2024)"), { series: "Topps Chrome", years: "2024", atStart: false });
  assert.equal(splitYear("Panini Prizm 2023").years, "2023");
});

test("splitYear: things that look like a year but are not", () => {
  assert.equal(splitYear("Panini Adrenalyn XL Series 1/2").years, null);
  assert.equal(splitYear("Topps 1952 Reprint 2020").years, null);
  assert.equal(splitYear("Topps 1994-2010").years, null);
  assert.equal(splitYear("Panini UEFA Euro 2016 Prizm").years, null);
  assert.equal(splitYear("Semic Elitserien").years, null);
  assert.equal(splitYear("").years, null);
});

test("splitYear: a single year in the middle is left alone, leftovers are tidied", () => {
  assert.equal(splitYear("Fleer 1998 - Ultra").years, null);
  assert.equal(splitYear("Topps 2024").series, "Topps");
  assert.equal(splitYear("Fleer 1998/99 - Ultra").series, "Fleer - Ultra");
});

test("displayName: with the year first", () => {
  assert.equal(displayName("Upper Deck Parkhurst 1994-1995", 1994, true), "1994-1995 Upper Deck Parkhurst");
  assert.equal(displayName("1994-95 Upper Deck", 1994, true), "1994-95 Upper Deck");
  assert.equal(displayName("Semic Elitserien", 1995, true), "1995 Semic Elitserien");
  assert.equal(displayName("Semic Elitserien", null, true), "Semic Elitserien");
});

test("displayName: switched off the name is left as it is", () => {
  assert.equal(displayName("Upper Deck Parkhurst 1994-1995", 1994, false), "Upper Deck Parkhurst 1994-1995");
});

test("seriesOf: sorting on the series ignores where the year stood", () => {
  const names = ["Topps Chrome 2024", "2023 Topps Chrome", "Panini Prizm 2022"];
  const sorted = [...names].sort((a, b) => seriesOf(a).localeCompare(seriesOf(b), "sv"));
  assert.deepEqual(sorted, ["Panini Prizm 2022", "Topps Chrome 2024", "2023 Topps Chrome"]);
});
