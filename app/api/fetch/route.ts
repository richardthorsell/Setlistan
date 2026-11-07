import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { SPORTS, dedupeTokens } from "@/lib/checklist";

export const runtime = "nodejs";
export const maxDuration = 300;

// Limits on time and money: one fetch should cost a few kronor and take about two minutes.
const MODEL = process.env.FETCH_MODEL || "claude-sonnet-5-5";
const PRICE_IN = Number(process.env.FETCH_PRICE_IN_PER_MTOK || 2) / 1e6; // USD per input token
const PRICE_OUT = Number(process.env.FETCH_PRICE_OUT_PER_MTOK || 10) / 1e6; // USD per output token
const PRICE_SEARCH = 0.01; // USD per web search
const DAILY_LIMIT = 3; // fetches per user and day
const ADMIN_DAILY_LIMIT = 20;
const MONTH_CAP_USD = Number(process.env.FETCH_MONTH_CAP_USD || 15); // all users together
const JOB_CAP_USD = Number(process.env.FETCH_JOB_CAP_USD || 0.5); // one fetch
const BUDGET_MS = 150_000; // Vercel stops the function at maxDuration; stop earlier so the set is always finalized
const MAX_TURNS = 8;

const SaveSection = z.object({
  code: z.string().max(12).default(""),
  name: z.string().min(1).max(120),
  cards: z
    .array(
      z.object({
        no: z.coerce.number().int().positive(),
        name: z.string().min(1).max(160),
        team: z.string().max(160).optional().default(""),
        rc: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(1000),
});
const SaveParallels = z.object({
  parallels: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        print_run: z.coerce.number().int().positive().max(100000).optional(),
        code: z.string().max(12).optional().default(""),
      }),
    )
    .min(1)
    .max(40),
});
const SPORT_IDS = SPORTS.map((s) => s.id) as [string, ...string[]];
const Finish = z.object({
  name: z.string().min(1).max(200),
  sport: z.enum(SPORT_IDS).optional(),
  source: z.string().max(500).optional().default(""),
  notes: z.string().max(600).optional().default(""),
});

const tools = [
  { type: "web_search_20260209", name: "web_search", max_uses: 3 },
  { type: "web_fetch_20260209", name: "web_fetch", max_uses: 3, max_content_tokens: 50000 },
  {
    name: "save_section",
    description:
      "Save the cards of one subset (base set or one insert set) to the database. Call once per subset; a long subset may be split across several calls with the same code and the cards are appended. Returns how many cards the subset now has.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        code: { type: "string", description: "Card number prefix of the subset, e.g. 'BM' for Beast Mode. Empty string for the base set." },
        name: { type: "string", description: "Subset name, e.g. 'Base' or 'Beast Mode'." },
        cards: {
          type: "array",
          items: {
            type: "object",
            properties: {
              no: { type: "integer", description: "Card number within the subset, without the prefix." },
              name: { type: "string", description: "Player or subject." },
              team: { type: "string", description: "Club or country." },
              rc: { type: "boolean", description: "True if it is a rookie card." },
            },
            required: ["no", "name"],
          },
        },
      },
      required: ["code", "name", "cards"],
    },
  },
  {
    name: "save_parallels",
    description:
      "Save the parallels of the set (colour or numbered versions of a subset's cards, e.g. 'Gold Rainbow' numbered /50). Call once, after the base set is saved. Skip autograph and relic parallels.",
    input_schema: {
      type: "object",
      properties: {
        parallels: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Parallel name without the print run, e.g. 'Gold Rainbow'." },
              print_run: { type: "integer", description: "N for a parallel numbered to /N (1 for 1/1). Omit if it is not numbered." },
              code: { type: "string", description: "Prefix of the subset it belongs to. Empty string for the base set." },
            },
            required: ["name"],
          },
        },
      },
      required: ["parallels"],
    },
  },
  {
    name: "finish",
    description: "Call once when all subsets are saved (or when no checklist could be found) to record the set's full name, the source URL and a short note.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "The set's full name, e.g. 'Topps Chrome Premier League 2025/26'." },
        sport: { type: "string", enum: SPORTS.map((s) => s.id), description: "The set's sport; 'ovrigt' for non-sport sets." },
        source: { type: "string", description: "URL of the checklist page used." },
        notes: { type: "string", description: "One or two sentences in Swedish on what is missing or uncertain." },
      },
      required: ["name"],
    },
  },
];

function slug(s: string) {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "set"
  );
}

const HEADERS = { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" };

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  const sportHint = SPORTS.find((s) => s.id === body?.sport)?.id;
  if (query.length < 3 || query.length > 300) return Response.json({ error: "Skriv namnet på ett set (3–300 tecken)." }, { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "Tjänsten saknar API-nyckel för Claude." }, { status: 500 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Logga in för att hämta nya set." }, { status: 401 });

  const isUrl = /^https?:\/\/\S+$/i.test(query);

  // A set that is already in the library is never fetched again (free and instant).
  if (!isUrl) {
    // Seasons and single years are kept apart ("2026" must not match the 2025/26 season).
    const qt = dedupeTokens(query);
    if (qt.length >= 3) {
      const { data: existing } = await supabase.from("sets").select("id, name, short_name, keywords").eq("status", "ready");
      const hit = (existing || []).find((s) => {
        const have = new Set(dedupeTokens(`${s.name} ${s.short_name || ""} ${s.keywords}`));
        return qt.every((w) => have.has(w));
      });
      if (hit) return new Response(JSON.stringify({ t: "done", setId: hit.id, m: `Setet finns redan i biblioteket: ${hit.name}` }) + "\n", { headers: HEADERS });
    }
  }

  // Spending caps: per user and day, and for the whole service per month.
  const { data: role } = await supabase.rpc("admin_role");
  // Looking up new lists on the web costs money, so only admins can do it. Everyone else suggests a set instead.
  if (!role) return Response.json({ error: "Nya listor läggs in av administratörerna. Föreslå setet i appen." }, { status: 403 });
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await supabase.from("fetch_jobs").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", since);
  const limit = role ? ADMIN_DAILY_LIMIT : DAILY_LIMIT;
  if ((count ?? 0) >= limit) return Response.json({ error: `Du har hämtat ${limit} set senaste dygnet. Försök igen i morgon.` }, { status: 429 });
  const { data: spend } = await supabase.rpc("fetch_spend_month");
  if (Number(spend ?? 0) >= MONTH_CAP_USD) return Response.json({ error: "Månadens budget för hämtningar är slut. Försök igen nästa månad." }, { status: 429 });

  // A fetch cut off by the platform leaves its set at "fetching"; release this user's stale ones.
  await supabase
    .from("sets")
    .update({ status: "ready", notes: "Hämtningen avbröts innan den blev klar; vissa delset kan saknas." })
    .eq("created_by", user.id)
    .eq("status", "fetching")
    .lt("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());

  const setId = `${slug(query)}-${Date.now().toString(36)}`;
  // The job row is what the daily limit and the monthly budget are counted from, so no row means no fetch.
  // Only admins can write it (fetch_job_start / fetch_job_finish); users cannot insert or edit fetch_jobs themselves.
  const { data: jobId, error: jobErr } = await supabase.rpc("fetch_job_start", { p_query: query, p_set_id: setId });
  if (jobErr || jobId == null) return Response.json({ error: "Kunde inte starta hämtningen." }, { status: 500 });
  const finishJob = (status: "done" | "failed", error: string | null, usage: { input_tokens: number; output_tokens: number; cost_usd: number }) =>
    supabase.rpc("fetch_job_finish", { p_id: jobId, p_status: status, p_error: error, p_in: usage.input_tokens, p_out: usage.output_tokens, p_cost: usage.cost_usd });
  const { error: setErr } = await supabase.from("sets").insert({ id: setId, name: query, keywords: query, status: "fetching", sport: sportHint ?? "ovrigt" });
  if (setErr) {
    await finishJob("failed", "could not create set", { input_tokens: 0, output_tokens: 0, cost_usd: 0 });
    return Response.json({ error: "Kunde inte skapa setet i databasen." }, { status: 500 });
  }

  const prompt = `Find the checklist for the trading card set ${isUrl ? "on this page: " + query : `"${query}"`} and save it. Be quick and frugal: you have about two minutes.

${isUrl ? "Fetch that page once with web_fetch." : "Do one web_search to find a page with the full checklist (for example checklistinsider.com, cardsmithsbreaks.com, cartophilic-info-exch.blogspot.com, beckett.com, cardboardconnection.com or tcdb.com), then read the best page once with web_fetch. Never read the same page twice."}

Work in this order and save as you go:
1. save_section for the base set (code ""), then save_parallels once with the base parallels and their print runs (e.g. Gold Rainbow /50), then save_section for each insert set under its number prefix. Skip autographs and relics.
2. Each card: no (the number within its subset), name, team (club or country), rc (true for rookie cards). Take every card from the page; never invent or guess cards. If you cannot find a reliable checklist, save nothing.

When you are done, call finish with the set's full name, its sport${sportHint ? ` (the user is browsing "${sportHint}", use it unless the set clearly belongs to another sport)` : ""}, the source URL and a short note in Swedish.`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      const sectionIds = new Map<string, number>();
      let position = 0;
      let parallelPos = 0;
      let totalCards = 0;
      let meta: z.infer<typeof Finish> | null = null;
      let failure: string | null = null;
      let inTok = 0;
      let cacheTok = 0;
      let outTok = 0;
      let searches = 0;
      const cost = () => (inTok + cacheTok * 0.1) * PRICE_IN + outTok * PRICE_OUT + searches * PRICE_SEARCH;
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), BUDGET_MS);
      req.signal.addEventListener("abort", () => ctl.abort());

      const saveSection = async (input: unknown) => {
        const parsed = SaveSection.safeParse(input);
        if (!parsed.success) return { error: "Invalid input: " + parsed.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; ") };
        const code = parsed.data.code.toUpperCase().replace(/[^A-Z0-9]/g, "");
        let sectionId = sectionIds.get(code);
        if (!sectionId) {
          const { data, error } = await supabase
            .from("sections")
            .upsert({ set_id: setId, code, name: parsed.data.name, position: position++ }, { onConflict: "set_id,code" })
            .select("id")
            .single();
          if (error || !data) return { error: "Could not save the subset." };
          sectionId = data.id as number;
          sectionIds.set(code, sectionId);
        }
        const rows = parsed.data.cards.map((c) => ({
          set_id: setId,
          section_id: sectionId,
          no: c.no,
          name: c.name.trim(),
          team: (c.team || "").trim(),
          tags: c.rc ? ["RC"] : [],
        }));
        const { error } = await supabase.from("cards").upsert(rows, { onConflict: "section_id,no", ignoreDuplicates: true });
        if (error) return { error: "Could not save the cards." };
        const { count: n } = await supabase.from("cards").select("id", { count: "exact", head: true }).eq("section_id", sectionId);
        totalCards += rows.length;
        send({ t: "log", k: "ok", m: `Sparade ${parsed.data.name}: ${n ?? rows.length} kort` });
        return { subset: parsed.data.name, total: n ?? rows.length };
      };

      const saveParallels = async (input: unknown) => {
        const parsed = SaveParallels.safeParse(input);
        if (!parsed.success) return { error: "Invalid input: " + parsed.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; ") };
        const rows = parsed.data.parallels.map((p, i) => ({
          set_id: setId,
          section_id: sectionIds.get(p.code.toUpperCase().replace(/[^A-Z0-9]/g, "")) ?? sectionIds.get("") ?? null,
          name: p.name.trim(),
          print_run: p.print_run ?? null,
          position: parallelPos + i + 1,
        }));
        parallelPos += rows.length;
        const { error } = await supabase.from("parallels").upsert(rows, { onConflict: "set_id,section_id,name", ignoreDuplicates: true });
        if (error) return { error: "Could not save the parallels." };
        send({ t: "log", k: "ok", m: `Sparade ${rows.length} paralleller` });
        return { saved: rows.length };
      };

      try {
        const client = new Anthropic();
        const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [{ role: "user", content: prompt }];
        let jsonRetries = 0;
        send({ t: "log", m: "Letar efter checklistan …" });

        for (let turn = 0; turn < MAX_TURNS && !meta; turn++) {
          const params = {
            model: MODEL,
            max_tokens: 24000,
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            output_config: { effort: process.env.FETCH_EFFORT || "low" },
            tools,
            messages,
          };
          const s = client.beta.messages.stream(params as unknown as Anthropic.Beta.Messages.MessageCreateParamsStreaming, { signal: ctl.signal });
          let message: Anthropic.Beta.Messages.BetaMessage;
          try {
            message = await s.finalMessage();
            jsonRetries = 0;
          } catch (err) {
            if (err instanceof Anthropic.APIError || jsonRetries++ >= 2) throw err;
            continue;
          }

          const u = message.usage as unknown as {
            input_tokens?: number;
            output_tokens?: number;
            cache_creation_input_tokens?: number;
            cache_read_input_tokens?: number;
            server_tool_use?: { web_search_requests?: number };
          };
          inTok += (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
          cacheTok += u.cache_read_input_tokens ?? 0;
          outTok += u.output_tokens ?? 0;
          searches += u.server_tool_use?.web_search_requests ?? 0;

          for (const block of message.content) {
            if (block.type === "server_tool_use") {
              const input = block.input as { query?: string; url?: string };
              if (block.name === "web_search" && input.query) send({ t: "log", m: "Söker: " + input.query });
              if (block.name === "web_fetch" && input.url) send({ t: "log", m: "Läser " + input.url.replace(/^https?:\/\//, "").slice(0, 80) });
            }
          }

          if (message.stop_reason === "refusal") {
            failure = "Hämtningen avböjdes för den här listan.";
            break;
          }
          if (message.stop_reason === "pause_turn") {
            messages.push({ role: "assistant", content: message.content });
            if (cost() >= JOB_CAP_USD) {
              failure = "Kostnadsgränsen för en hämtning nåddes. Det som hann sparas finns med.";
              break;
            }
            continue;
          }
          const toolUses = message.content.filter((b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === "tool_use");
          if (toolUses.length === 0) break;
          if (message.stop_reason === "max_tokens") {
            failure = "Svaret blev för långt och klipptes av.";
            break;
          }

          messages.push({ role: "assistant", content: message.content });
          const results: Anthropic.Beta.Messages.BetaToolResultBlockParam[] = [];
          for (const tu of toolUses) {
            if (tu.name === "save_section") {
              const r = await saveSection(tu.input);
              results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(r), is_error: "error" in r });
            } else if (tu.name === "save_parallels") {
              const r = await saveParallels(tu.input);
              results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(r), is_error: "error" in r });
            } else if (tu.name === "finish") {
              const p = Finish.safeParse(tu.input);
              meta = p.success ? p.data : { name: query, source: "", notes: "" };
              results.push({ type: "tool_result", tool_use_id: tu.id, content: "Saved." });
            } else {
              results.push({ type: "tool_result", tool_use_id: tu.id, content: "Unknown tool", is_error: true });
            }
          }
          messages.push({ role: "user", content: results });
          if (!meta && cost() >= JOB_CAP_USD) {
            failure = "Kostnadsgränsen för en hämtning nåddes. Det som hann sparas finns med.";
            break;
          }
        }
      } catch (err) {
        failure =
          ctl.signal.aborted && !req.signal.aborted
            ? "Tiden tog slut. Det som hann sparas finns med, men vissa delset kan saknas."
            : err instanceof Anthropic.RateLimitError
              ? "Tjänsten är överbelastad just nu. Försök igen om en stund."
              : err instanceof Anthropic.APIError
                ? `Hämtningen svarade med fel ${err.status}.`
                : req.signal.aborted
                  ? "Avbruten."
                  : "Något gick fel under hämtningen.";
        console.error("fetch failed", err);
      }
      clearTimeout(timer);

      const usage = { input_tokens: inTok + cacheTok, output_tokens: outTok, cost_usd: Number(cost().toFixed(4)) };
      if (totalCards === 0) {
        await supabase.from("sets").delete().eq("id", setId);
        await finishJob("failed", failure ?? "no cards", usage);
        send({ t: "error", m: failure ?? (meta?.notes || "Ingen tillförlitlig checklista hittades. Prova ett mer exakt namn eller klistra in en adress till listan.") });
      } else {
        await supabase
          .from("sets")
          .update({
            status: "ready",
            name: meta?.name || query,
            sport: meta?.sport || sportHint || "ovrigt",
            source: meta?.source || "",
            source_urls: meta?.source ? [meta.source] : [],
            notes: meta?.notes || failure || "",
          })
          .eq("id", setId);
        await finishJob("done", failure, usage);
        send({ t: "done", setId, m: `Klart: ${totalCards} kort.${failure ? " " + failure : ""}` });
      }
      controller.close();
    },
  });

  return new Response(stream, { headers: HEADERS });
}
