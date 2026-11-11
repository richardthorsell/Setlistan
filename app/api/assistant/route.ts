import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { ADVISOR_INTENTS, SPORT_IDS, fromAi } from "@/lib/assistant";

export const runtime = "nodejs";
export const maxDuration = 20;

// Collector Assistant V2: a small model turns a question the rules did not understand into one of the allowed intents.
// It never sees the user's collection, never writes SQL and never answers the question; the app runs the intent as usual.
const MODEL = process.env.ASSISTANT_MODEL || "claude-haiku-5-5";
const PRICE_IN = Number(process.env.ASSISTANT_PRICE_IN_PER_MTOK || 1) / 1e6; // USD per input token
const PRICE_OUT = Number(process.env.ASSISTANT_PRICE_OUT_PER_MTOK || 5) / 1e6; // USD per output token

const BASE_INTENTS = ["nearly_complete", "missing_cards", "top_duplicates", "sell_candidates", "for_sale_marked", "player_collection", "collection_summary", "not_started"];

const DESCRIPTIONS: Record<string, string> = {
  nearly_complete: "sets that are close to complete (min_percent, sport)",
  missing_cards: "cards the user is missing in sets they have started (player, sport, limit)",
  top_duplicates: "cards the user has more than one copy of (limit)",
  sell_candidates: "duplicates that could be sold (limit)",
  for_sale_marked: "cards the user has marked for sale (limit)",
  player_collection: "how many cards of one player the user has (player)",
  collection_summary: "totals and statistics about the whole collection",
  not_started: "favourite sets the user has not started on (limit)",
  sell_suggestions: "duplicates worth selling, with price references (limit)",
  completion_plan: "can selling duplicates in one sport pay for completing nearly finished sets in another (sell_sport, target_sport, targets)",
};

type Flag = { key: string; mode: string };

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Logga in för att fråga assistenten." }, { status: 401 });

  const b = (await req.json().catch(() => null)) as { question?: unknown } | null;
  const question = String(b?.question ?? "").trim().slice(0, 200);
  if (question.length < 3) return Response.json({ error: "Skriv en fråga." }, { status: 400 });

  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "AI-tolkningen är inte konfigurerad." }, { status: 503 });
  // The cost of a call is recorded by the server with the service role; without it the spending cap could not be enforced.
  const admin = adminClient();
  if (!admin) return Response.json({ error: "AI-tolkningen är inte konfigurerad." }, { status: 503 });

  // Is the advisor on for this user? (decides whether the advisor intents may be chosen)
  const { data: flagRows } = await supabase.from("feature_flags").select("key, mode").eq("key", "collector_advisor");
  const advisorMode = ((flagRows as Flag[] | null) || [])[0]?.mode;
  const { data: roleData } = await supabase.rpc("admin_role");
  const advisor = advisorMode === "on" || (advisorMode === "superuser" && roleData === "superuser");

  // Reserve a call: checks the switches, the per-user daily limit and the monthly cap, all inside the database.
  const { data: reserve, error: rErr } = await supabase.rpc("assistant_ai_reserve");
  const r = (reserve as { call_id: number | null; status: string }[] | null)?.[0];
  if (rErr || !r) return Response.json({ error: "Kunde inte starta AI-tolkningen just nu." }, { status: 500 });
  if (r.status === "off") return Response.json({ error: "AI-tolkningen är avstängd." }, { status: 403 });
  if (r.status === "user_limit") return Response.json({ error: "Du har använt dagens AI-frågor. Välj ett av förslagen eller försök igen i morgon." }, { status: 429 });
  if (r.status === "global_cap") return Response.json({ error: "Månadens AI-budget är slut. Välj ett av förslagen." }, { status: 429 });
  const callId = r.call_id as number;

  const intents = advisor ? [...BASE_INTENTS, ...ADVISOR_INTENTS] : BASE_INTENTS;
  const tool: Anthropic.Tool = {
    name: "choose_intent",
    description: "Pick the one intent that matches the collector's question, or 'none' if no intent fits.",
    input_schema: {
      type: "object",
      properties: {
        intent: { type: "string", enum: [...intents, "none"] },
        min_percent: { type: "integer", minimum: 0, maximum: 99 },
        sport: { type: "string", enum: [...SPORT_IDS] },
        player: { type: "string", maxLength: 40 },
        limit: { type: "integer", minimum: 1, maximum: 50 },
        sell_sport: { type: "string", enum: [...SPORT_IDS] },
        target_sport: { type: "string", enum: [...SPORT_IDS] },
        targets: { type: "integer", minimum: 1, maximum: 5 },
      },
      required: ["intent"],
    },
  };
  const system =
    "You route a trading-card collector's question (Swedish or English) to one intent about their own collection by calling choose_intent. " +
    "You never answer the question, never invent data and never write SQL. Use 'none' when no intent fits. Intents:\n" +
    intents.map((i) => `- ${i}: ${DESCRIPTIONS[i]}`).join("\n");

  let inTok = 0;
  let outTok = 0;
  const finish = (ok: boolean, intent: string, error: string | null) =>
    admin.rpc("assistant_ai_finish", { p_id: callId, p_intent: intent, p_ok: ok, p_error: error, p_in: inTok, p_out: outTok, p_cost: Number((inTok * PRICE_IN + outTok * PRICE_OUT).toFixed(5)) });

  try {
    const client = new Anthropic({ timeout: 12000, maxRetries: 0 });
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 150,
      system,
      tools: [tool],
      tool_choice: { type: "tool", name: "choose_intent" },
      messages: [{ role: "user", content: question }],
    });
    inTok = msg.usage?.input_tokens ?? 0;
    outTok = msg.usage?.output_tokens ?? 0;
    const use = msg.content.find((c): c is Anthropic.ToolUseBlock => c.type === "tool_use");
    const intent = fromAi(use?.input, { advisor });
    await finish(true, intent?.name ?? "none", null);
    return Response.json({ intent });
  } catch (e) {
    const text = e instanceof Error ? e.message : "unknown";
    await finish(false, "error", text);
    return Response.json({ error: "AI-tolkningen misslyckades just nu. Välj ett av förslagen." }, { status: 502 });
  }
}
