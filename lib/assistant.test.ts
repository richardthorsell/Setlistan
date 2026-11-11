// Run with: npm test (Node 22.6+ strips the types, no extra dependencies).
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectIntent, flat, SUGGESTIONS } from "./assistant.ts";

const names = (qs: string[]) => qs.map((q) => detectIntent(q)?.name ?? null);

test("flat: lower case, no accents or punctuation", () => {
  assert.equal(flat("  Vilka SET är nästan klara?! "), "vilka set ar nastan klara");
});

test("Swedish questions map to the right intent", () => {
  assert.deepEqual(
    names([
      "Vilka set är nästan klara?",
      "mina nästan klara set",
      "Vilka 15 kort saknar jag?",
      "Vilka är mina vanligaste dubbletter?",
      "Vilka kort har jag flest av?",
      "Vilka hockeyset är över 90 % klara?",
      "Vilka dubbletter har ett marknadspris?",
      "Vilka kort har jag markerat till försäljning?",
      "Vilka kort borde jag sälja?",
      "Vilka set har jag inte börjat samla?",
      "Hur många Messikort har jag?",
      "Hur många kort har jag?",
      "Ge mig en sammanfattning",
    ]),
    ["nearly_complete", "nearly_complete", "missing_cards", "top_duplicates", "top_duplicates", "nearly_complete", "top_duplicates", "for_sale_marked", "sell_candidates", "not_started", "player_collection", "collection_summary", "collection_summary"],
  );
});

test("English questions map to the right intent", () => {
  assert.deepEqual(
    names([
      "Which sets are almost complete?",
      "Which cards am I missing?",
      "What are my top duplicates?",
      "Which cards have I marked for sale?",
      "What should I sell?",
      "Which sets haven't I started?",
      "How many Messi cards do I have?",
      "How many cards do I have?",
      "Show me an overview",
    ]),
    ["nearly_complete", "missing_cards", "top_duplicates", "for_sale_marked", "sell_candidates", "not_started", "player_collection", "collection_summary", "collection_summary"],
  );
});

test("parameters: numbers, percent, sport and player", () => {
  assert.deepEqual(detectIntent("Vilka 15 kort saknar jag?"), { name: "missing_cards", player: undefined, sport: undefined, limit: 15 });
  assert.deepEqual(detectIntent("Vilka hockeyset är över 90 % klara?"), { name: "nearly_complete", min: 90, sport: "ishockey", limit: 15 });
  assert.deepEqual(detectIntent("Hur många Messikort har jag?"), { name: "player_collection", player: "messi" });
  assert.deepEqual(detectIntent("How many Messi cards do I have?"), { name: "player_collection", player: "messi" });
  assert.deepEqual(detectIntent("Vilka Messikort saknar jag?"), { name: "missing_cards", player: "messi", sport: undefined, limit: 30 });
  assert.deepEqual(detectIntent("which football cards am i missing"), { name: "missing_cards", player: undefined, sport: "fotboll", limit: 30 });
  assert.deepEqual(detectIntent("nearly complete NFL sets"), { name: "nearly_complete", min: 70, sport: "amerikansk-fotboll", limit: 15 });
});

test("limits are clamped to 1-50", () => {
  assert.equal((detectIntent("visa 500 dubbletter") as { limit: number }).limit, 50);
  assert.equal((detectIntent("show 0 duplicates") as { limit: number }).limit, 1);
});

test("percent is clamped below 100", () => {
  assert.equal((detectIntent("sets over 150 % complete") as { min: number }).min, 99);
});

test("questions that match nothing return null (no guessing)", () => {
  assert.deepEqual(names(["", "  ", "hej", "vad är vädret", "tell me a joke", "?", "asdf qwer"]), [null, null, null, null, null, null, null]);
});

test("input is treated as plain text: SQL and markup do not turn into intents or parameters", () => {
  assert.equal(detectIntent("'; drop table owned; --"), null);
  assert.equal(detectIntent("<script>alert(1)</script>"), null);
  const i = detectIntent("hur många '; drop table owned; -- kort har jag") as { name: string; player?: string };
  assert.equal(i.name, "player_collection");
  assert.ok(!/[;'<>]/.test(i.player || ""));
});

test("long and odd input does not break the router", () => {
  assert.equal(detectIntent("a".repeat(5000)), null);
  assert.equal(detectIntent("saknar ".repeat(500))?.name, "missing_cards");
});

test("every suggestion is a valid intent", () => {
  for (const s of SUGGESTIONS) assert.ok(s.label.length > 3 && s.intent.name);
});
