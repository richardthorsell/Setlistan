// Run with: npm test (Node 22.6+ strips the types, no extra dependencies).
import { test } from "node:test";
import assert from "node:assert/strict";
import { ADVISOR_INTENTS, ADVISOR_SUGGESTIONS, detectIntent, flat, fromAi, SUGGESTIONS } from "./assistant.ts";

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

test("advisor: sell questions become sell_suggestions only when the advisor is on", () => {
  assert.equal(detectIntent("Vilka kort borde jag sälja?")?.name, "sell_candidates");
  assert.equal(detectIntent("Vilka kort borde jag sälja?", { advisor: true })?.name, "sell_suggestions");
  assert.equal(detectIntent("what should I sell", { advisor: true })?.name, "sell_suggestions");
});

test("advisor: completion plan from a long Swedish question", () => {
  const i = detectIntent("Vilka av mina hockeykort borde jag sälja för att komplettera mina tre nästan färdiga fotbollsset?", { advisor: true });
  assert.deepEqual(i, { name: "completion_plan", sellSport: "ishockey", targetSport: "fotboll", targets: 3 });
});

test("advisor: completion plan from an English question", () => {
  const i = detectIntent("Which hockey cards should I sell to complete my two almost finished football sets?", { advisor: true });
  assert.deepEqual(i, { name: "completion_plan", sellSport: "ishockey", targetSport: "fotboll", targets: 2 });
});

test("fromAi: accepts only known intents and checks every value", () => {
  assert.deepEqual(fromAi({ intent: "nearly_complete", min_percent: 85, sport: "ishockey", limit: 5 }), { name: "nearly_complete", min: 85, sport: "ishockey", limit: 5 });
  assert.deepEqual(fromAi({ intent: "nearly_complete", min_percent: 500, sport: "curling", limit: 9999 }), { name: "nearly_complete", min: 99, sport: undefined, limit: 50 });
  assert.deepEqual(fromAi({ intent: "player_collection", player: "Lionel Messi" }), { name: "player_collection", player: "Lionel Messi" });
  assert.equal(fromAi({ intent: "player_collection", player: "x" }), null);
  assert.equal(fromAi({ intent: "none" }), null);
  assert.equal(fromAi({ intent: "drop_table" }), null);
  assert.equal(fromAi({}), null);
  assert.equal(fromAi(null), null);
  assert.equal(fromAi("nearly_complete"), null);
});

test("fromAi: advisor intents need the advisor to be on", () => {
  for (const name of ADVISOR_INTENTS) {
    assert.equal(fromAi({ intent: name }), null);
    assert.equal(fromAi({ intent: name }, { advisor: true })?.name, name);
  }
});

test("fromAi: a player name is reduced to letters, so injected text cannot get through", () => {
  const i = fromAi({ intent: "missing_cards", player: "Messi'; drop table owned; --" }) as { player?: string };
  assert.ok(!/[;<>]/.test(i.player || ""));
  assert.ok((i.player || "").length <= 40);
});

test("every advisor suggestion is a valid advisor intent", () => {
  for (const s of ADVISOR_SUGGESTIONS) assert.ok((ADVISOR_INTENTS as string[]).includes(s.intent.name));
});
