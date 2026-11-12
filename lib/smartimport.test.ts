// Run with: npm test (Node 22.6+ strips the types, no extra dependencies).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LIMITS, ImportError, cleanCell, decodeBytes, detectDelimiter, fingerprint, looksLikeFormula, looksLikeHeader, mapColumns,
  flagColumns, parseCardNo, parseDelimited, parseHave, parseList, parsePasted, parseQty, rowsFromTable, seasonYear, tableFromSheet,
} from "./smartimport.ts";

test("decodeBytes: UTF-8, BOM and Windows-1252", () => {
  assert.equal(decodeBytes(new TextEncoder().encode("﻿Håkan").buffer as ArrayBuffer), "Håkan");
  const win = new Uint8Array([72, 0xE5, 107, 97, 110]); // "Håkan" in Windows-1252
  assert.equal(decodeBytes(win.buffer), "Håkan");
});

test("decodeBytes: too large files are refused", () => {
  assert.throws(() => decodeBytes(new ArrayBuffer(LIMITS.bytes + 1)), ImportError);
});

test("detectDelimiter: comma, semicolon and tab", () => {
  assert.equal(detectDelimiter("a,b,c\n1,2,3"), ",");
  assert.equal(detectDelimiter("a;b;c\n1;2;3"), ";");
  assert.equal(detectDelimiter("a\tb\tc\n1\t2\t3"), "\t");
  assert.equal(detectDelimiter("just text"), ",");
});

test("parseDelimited: quotes, doubled quotes and line breaks inside quotes", () => {
  const t = parseDelimited('Set,Player,Qty\n"1993-94 Parkhurst","Loob, Håkan",2\n"A ""B""","two\nlines",1\n', ",");
  assert.deepEqual(t[1], ["1993-94 Parkhurst", "Loob, Håkan", "2"]);
  assert.deepEqual(t[2], ["A \"B\"", "two lines", "1"]);
});

test("parseDelimited: windows line endings and empty lines", () => {
  assert.equal(parseDelimited("a;b\r\n\r\n1;2\r\n", ";").length, 2);
});

test("parseDelimited: the row limit is enforced", () => {
  const big = Array.from({ length: LIMITS.rows + 5 }, (_, i) => `${i},x`).join("\n");
  assert.throws(() => parseDelimited(big, ","), ImportError);
});

test("cleanCell: control characters removed, long text cut, dates as text", () => {
  assert.equal(cleanCell("a\u0000b\u0007c"), "abc");
  assert.equal(cleanCell("x".repeat(1000)).length, LIMITS.cell);
  assert.equal(cleanCell(new Date("2020-05-17T00:00:00Z")), "2020-05-17");
  assert.equal(cleanCell(null), "");
  assert.equal(cleanCell(42), "42");
});

test("formulas are never evaluated and are recognised", () => {
  assert.equal(looksLikeFormula("=SUM(A1:A9)"), true);
  assert.equal(looksLikeFormula("@cmd"), true);
  assert.equal(looksLikeFormula("-cmd|calc"), true);
  assert.equal(looksLikeFormula("-5"), false);
  assert.equal(looksLikeFormula("Håkan Loob"), false);
  const r = rowsFromTable([["Set", "Number", "Player", "Quantity"], ["=HYPERLINK(\"x\")", "1", "A", "1"]], mapColumns(["Set", "Number", "Player", "Quantity"]));
  assert.equal(r.formulaCells, 1);
  assert.equal(r.rows[0].r.set, "=HYPERLINK(\"x\")"); // kept as plain text
});

test("mapColumns: English and Swedish headers", () => {
  assert.deepEqual(mapColumns(["Set", "Number", "Player", "Quantity"]), { set: 0, no: 1, name: 2, qty: 3 });
  assert.deepEqual(mapColumns(["Serie", "Nr", "Spelare", "Lag", "Antal", "Parallell"]), { set: 0, no: 1, name: 2, team: 3, qty: 4, parallel: 5 });
  assert.equal(looksLikeHeader(["Set", "Number"]), true);
  assert.equal(looksLikeHeader(["1", "Håkan Loob"]), false);
});

test("parseCardNo: prefixes, separators and print runs", () => {
  assert.deepEqual(parseCardNo("12"), { code: "", no: 12 });
  assert.deepEqual(parseCardNo("#12"), { code: "", no: 12 });
  assert.deepEqual(parseCardNo("BM 12"), { code: "BM", no: 12 });
  assert.deepEqual(parseCardNo("bm-12"), { code: "BM", no: 12 });
  assert.deepEqual(parseCardNo("BM12"), { code: "BM", no: 12 });
  assert.deepEqual(parseCardNo("SBC2 271"), { code: "SBC2", no: 271 });
  assert.deepEqual(parseCardNo("45/100"), { code: "", no: 45 });
  assert.equal(parseCardNo("abc"), null);
  assert.equal(parseCardNo(""), null);
});

test("parseQty: the usual forms, and rejects nonsense", () => {
  assert.equal(parseQty(""), 1);
  assert.equal(parseQty("2"), 2);
  assert.equal(parseQty("x3"), 3);
  assert.equal(parseQty("3x"), 3);
  assert.equal(parseQty("×4"), 4);
  assert.equal(parseQty("0"), null);
  assert.equal(parseQty("1000"), null);
  assert.equal(parseQty("two"), null);
  assert.equal(parseQty("-2"), null);
});

test("seasonYear: seasons, short seasons and single years", () => {
  assert.deepEqual(seasonYear("1993-94 Parkhurst"), { year: 1993, rest: "Parkhurst" });
  assert.deepEqual(seasonYear("Panini Prizm (25-26)"), { year: 2025, rest: "Panini Prizm" });
  assert.deepEqual(seasonYear("Topps Chrome 2024/25"), { year: 2024, rest: "Topps Chrome" });
  assert.deepEqual(seasonYear("1995 Semic Globe"), { year: 1995, rest: "Semic Globe" });
  assert.deepEqual(seasonYear("95-96 Upper Deck"), { year: 1995, rest: "Upper Deck" });
  assert.deepEqual(seasonYear("No year here"), { year: null, rest: "No year here" });
});

test("table: the example from the specification", () => {
  const p = parsePasted("Set | Number | Player | Quantity\n1993-94 Parkhurst | 12 | Håkan Loob | 2\n1993-94 Parkhurst | 13 | Mats Sundin | 1".replace(/ \| /g, "\t"));
  assert.equal(p.kind, "table");
  if (p.kind !== "table") return;
  const r = rowsFromTable(p.table, p.mapping);
  assert.equal(r.rows.length, 2);
  assert.deepEqual(r.rows[0].r, { set: "Parkhurst", year: 1993, code: "", section: "", no: 12, name: "Håkan Loob", team: "", qty: 2, parallel: "", serial: "", status: "" });
  assert.equal(r.rows[1].r.qty, 1);
  assert.equal(r.rows[0].n, 2);
  assert.equal(r.rows[0].o["Player"], "Håkan Loob");
});

test("list: a heading followed by card lines, the example from the specification", () => {
  const r = parseList("1993-94 Parkhurst\n#12 Håkan Loob x2\n#13 Mats Sundin\n#16 Peter Forsberg x3");
  assert.equal(r.rows.length, 3);
  assert.deepEqual(r.rows.map((x) => [x.r.no, x.r.name, x.r.qty, x.r.set, x.r.year]), [
    [12, "Håkan Loob", 2, "Parkhurst", 1993],
    [13, "Mats Sundin", 1, "Parkhurst", 1993],
    [16, "Peter Forsberg", 3, "Parkhurst", 1993],
  ]);
});

test("list: several headings, prefixes, team after a dash, a year heading", () => {
  const r = parseList("1994 Topps Chrome\nBM 5 Mikael Renberg - Philadelphia\nGL 7 Peter Forsberg x2\n## 1995 Semic Globe\n3 Tommy Salo");
  assert.equal(r.rows.length, 3);
  assert.deepEqual(r.rows[0].r, { set: "Topps Chrome", year: 1994, code: "BM", section: "", no: 5, name: "Mikael Renberg", team: "Philadelphia", qty: 1, parallel: "", serial: "", status: "" });
  assert.equal(r.rows[1].r.qty, 2);
  assert.equal(r.rows[2].r.set, "Semic Globe");
  assert.equal(r.rows[2].r.year, 1995);
});

test("pasted text: a table is detected, a list falls back to the list reader", () => {
  assert.equal(parsePasted("Set;Nr;Spelare;Antal\nA;1;B;2").kind, "table");
  assert.equal(parsePasted("1993-94 Parkhurst\n#12 Håkan Loob x2").kind, "list");
  const p = parsePasted("1\tHåkan Loob\n2\tMats Sundin");
  assert.equal(p.kind, "table");
  if (p.kind === "table") assert.deepEqual(p.mapping, { no: 0, name: 1 });
});

test("a default set is used when the table has no set column", () => {
  const r = rowsFromTable([["Nr", "Spelare"], ["1", "A"]], mapColumns(["Nr", "Spelare"]), { defaultSet: "1993-94 Parkhurst" });
  assert.equal(r.rows[0].r.set, "Parkhurst");
  assert.equal(r.rows[0].r.year, 1993);
});

test("missing and wrong values: rows are kept and flagged by their values, not dropped", () => {
  const r = rowsFromTable([["Set", "Nr", "Spelare", "Antal"], ["A", "", "", "x"], ["A", "5", "B", "0"], ["", "", "", ""]], mapColumns(["Set", "Nr", "Spelare", "Antal"]));
  assert.equal(r.rows.length, 2);
  assert.equal(r.skipped, 1);
  assert.equal(r.rows[0].r.qty, null);
  assert.equal(r.rows[1].r.qty, null);
});

test("an excel sheet: values become text, empty rows are dropped", () => {
  const t = tableFromSheet([["Set", "Nr"], ["A", 12], [null, null], ["B", new Date("2020-01-02T00:00:00Z")]]);
  assert.deepEqual(t, [["Set", "Nr"], ["A", "12"], ["B", "2020-01-02"]]);
});

test("the row limit applies to sheets and to lists", () => {
  assert.throws(() => tableFromSheet(Array.from({ length: LIMITS.rows + 5 }, (_, i) => [String(i)])), ImportError);
  assert.throws(() => parseList(Array.from({ length: LIMITS.rows + 400 }, (_, i) => `${i + 1} A`).join("\n")), ImportError);
});

test("a large import: 10 000 rows are parsed quickly", () => {
  const text = "Set,Nr,Spelare,Antal\n" + Array.from({ length: 10000 }, (_, i) => `1993-94 Parkhurst,${(i % 900) + 1},Player ${i},${(i % 3) + 1}`).join("\n");
  const t0 = performance.now();
  const p = parsePasted(text);
  assert.equal(p.kind, "table");
  if (p.kind !== "table") return;
  const r = rowsFromTable(p.table, p.mapping);
  const ms = performance.now() - t0;
  assert.equal(r.rows.length, 10000);
  assert.ok(ms < 2000, `took ${ms} ms`);
});

test("fingerprint: stable for the same rows, different for different rows", async () => {
  const a = rowsFromTable([["Set", "Nr", "Spelare"], ["A", "1", "B"]], mapColumns(["Set", "Nr", "Spelare"])).rows;
  const b = rowsFromTable([["Set", "Nr", "Spelare"], ["A", "1", "B"]], mapColumns(["Set", "Nr", "Spelare"])).rows;
  const c = rowsFromTable([["Set", "Nr", "Spelare"], ["A", "2", "B"]], mapColumns(["Set", "Nr", "Spelare"])).rows;
  assert.equal(await fingerprint(a), await fingerprint(b));
  assert.notEqual(await fingerprint(a), await fingerprint(c));
  assert.match(await fingerprint(a), /^[0-9a-f]{64}$/);
});

test("parallels and serial numbers are read when the columns exist", () => {
  const h = ["Set", "Nr", "Spelare", "Parallell", "Serienummer", "Antal"];
  const r = rowsFromTable([h, ["A", "5", "B", "Gold /50", "12/50", "1"]], mapColumns(h));
  assert.equal(r.rows[0].r.parallel, "Gold /50");
  assert.equal(r.rows[0].r.serial, "12/50");
});

test("parseHave: yes, no, numbers and unclear values", () => {
  assert.equal(parseHave("true"), 1);
  assert.equal(parseHave("Ja"), 1);
  assert.equal(parseHave("x"), 1);
  assert.equal(parseHave("false"), 0);
  assert.equal(parseHave(""), 0);
  assert.equal(parseHave("0"), 0);
  assert.equal(parseHave("3"), 3);
  assert.equal(parseHave("maybe"), null);
  assert.equal(parseHave("6.955223880597015"), null);
});

test("mapColumns: Typ is the subset, Har is ownership", () => {
  assert.deepEqual(mapColumns(["#", "Typ", "Namn", "Har"]), { no: 0, section: 1, name: 2, have: 3 });
});

test("a have column: only owned rows become rows, the others are counted", () => {
  const h = ["#", "Typ", "Namn", "Har"];
  const r = rowsFromTable([h, ["1", "Base", "A", "true"], ["2", "Base", "B", "false"], ["3", "Vintage", "C", "2"], ["4", "Base", "D", ""]], mapColumns(h), { defaultSet: "1994-95 Parkhurst" });
  assert.deepEqual(r.rows.map((x) => [x.r.no, x.r.qty, x.r.section]), [[1, 1, "Base"], [3, 2, "Vintage"]]);
  assert.equal(r.notOwned, 2);
});

test("parallel columns: one extra row for every yes, named after the column heading", () => {
  const h = ["#", "Typ", "Namn", "Har", "Gold G", "Green H"];
  const m = mapColumns(h);
  const r = rowsFromTable([h, ["1", "Base", "A", "true", "true", "false"], ["2", "Base", "B", "true", "", "true"]], m, { flagCols: [4, 5] });
  assert.equal(r.rows.length, 4);
  assert.deepEqual(r.rows.map((x) => [x.r.no, x.r.parallel]), [[1, ""], [1, "Gold G"], [2, ""], [2, "Green H"]]);
  assert.equal(new Set(r.rows.map((x) => x.n)).size, 4); // every row has its own number
});

test("parallel columns without a have column: only the parallels are owned", () => {
  const h = ["#", "Namn", "Gold"];
  const r = rowsFromTable([h, ["1", "A", "true"], ["2", "B", "false"]], mapColumns(h), { flagCols: [2] });
  assert.deepEqual(r.rows.map((x) => [x.r.no, x.r.parallel]), [[1, "Gold"]]);
  assert.equal(r.notOwned, 1);
});

test("two columns with the same heading are both kept", () => {
  const r = rowsFromTable([["#", "Namn", "Namn"], ["1", "A", "B"]], mapColumns(["#", "Namn", "Namn"]));
  assert.equal(r.rows[0].o["Namn"], "A");
  assert.equal(r.rows[0].o["Namn (2)"], "B");
});

test("flagColumns: finds yes/no columns and not number columns", () => {
  const t = [["#", "Gold", "Antal", "Namn"], ["1", "true", "2", "A"], ["2", "false", "5", "B"], ["3", "", "1", "C"]];
  assert.deepEqual(flagColumns(t, true), [1]);
});
