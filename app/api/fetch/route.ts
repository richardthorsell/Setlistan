import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const DAILY_LIMIT = 5;
const MAX_TURNS = 16;

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
const Finish = z.object({
  name: z.string().min(1).max(200),
  source: z.string().max(500).optional().default(""),
  notes: z.string().max(600).optional().default(""),
});

const tools = [
  { type: "web_search_20260209", name: "web_search", max_uses: 6 },
  { type: "web_fetch_20260209", name: "web_fetch", max_uses: 8, max_content_tokens: 60000 },
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
    name: "finish",
    description: "Call once when all subsets are saved (or when no checklist could be found) to record the set's full name, the source URL and a short note.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "The set's full name, e.g. 'Topps Chrome Premier League 2025/26'." },
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
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "set"
  );
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  if (query.length < 3 || query.length > 300) return Response.json({ error: "Skriv namnet på ett set (3–300 tecken)." }, { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "Tjänsten saknar API-nyckel för Claude." }, { status: 500 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Logga in för att hämta nya set." }, { status: 401 });

  // Admins have no daily limit.
  const { data: role } = await supabase.rpc("admin_role");
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await supabase.from("fetch_jobs").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", since);
  if (!role && (count ?? 0) >= DAILY_LIMIT) return Response.json({ error: `Du har hämtat ${DAILY_LIMIT} set senaste dygnet. Försök igen i morgon.` }, { status: 429 });

  const setId = `${slug(query)}-${Date.now().toString(36)}`;
  const { data: job } = await supabase.from("fetch_jobs").insert({ query, set_id: setId }).select("id").single();
  const { error: setErr } = await supabase.from("sets").insert({ id: setId, name: query, keywords: query, status: "fetching" });
  if (setErr) return Response.json({ error: "Kunde inte skapa setet i databasen." }, { status: 500 });

  const isUrl = /^https?:\/\/\S+$/i.test(query);
  const prompt = `Find the complete checklist for the trading card set ${isUrl ? "on this page: " + query : `"${query}"`} and save it.

${isUrl ? "Fetch that page with web_fetch and take the cards from it." : "Use web_search to find a page with the full checklist (for example checklistinsider.com, cardsmithsbreaks.com, cartophilic-info-exch.blogspot.com, beckett.com, cardboardconnection.com or tcdb.com), then read it with web_fetch."}

Save the cards with save_section: the base set first (code ""), then each insert set under its number prefix. Leave out autographs, relics and parallels. Each card: no (the number within its subset), name, team (club or country), rc (true for rookie cards). Take every card from the page; never invent or guess cards. If you cannot find a reliable checklist, save nothing.

When you are done, call finish with the set's full name, the source URL and a short note in Swedish.`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      const sectionIds = new Map<string, number>();
      let position = 0;
      let totalCards = 0;
      let meta: z.infer<typeof Finish> | null = null;
      let failure: string | null = null;

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

      try {
        const client = new Anthropic();
        const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [{ role: "user", content: prompt }];
        let jsonRetries = 0;
        send({ t: "log", m: "Claude letar efter checklistan …" });

        for (let turn = 0; turn < MAX_TURNS && !meta; turn++) {
          const params = {
            model: "claude-opus-5-5",
            max_tokens: 64000,
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            output_config: { effort: "medium" },
            tools,
            messages,
          };
          const s = client.beta.messages.stream(params as unknown as Anthropic.Beta.Messages.MessageCreateParamsStreaming, { signal: req.signal });
          let message: Anthropic.Beta.Messages.BetaMessage;
          try {
            message = await s.finalMessage();
            jsonRetries = 0;
          } catch (err) {
            if (err instanceof Anthropic.APIError || jsonRetries++ >= 2) throw err;
            continue;
          }

          for (const block of message.content) {
            if (block.type === "server_tool_use") {
              const input = block.input as { query?: string; url?: string };
              if (block.name === "web_search" && input.query) send({ t: "log", m: "Söker: " + input.query });
              if (block.name === "web_fetch" && input.url) send({ t: "log", m: "Läser " + input.url.replace(/^https?:\/\//, "").slice(0, 80) });
            }
          }

          if (message.stop_reason === "refusal") {
            failure = "Claude avböjde att hämta den här listan.";
            break;
          }
          if (message.stop_reason === "pause_turn") {
            messages.push({ role: "assistant", content: message.content });
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
            } else if (tu.name === "finish") {
              const p = Finish.safeParse(tu.input);
              meta = p.success ? p.data : { name: query, source: "", notes: "" };
              results.push({ type: "tool_result", tool_use_id: tu.id, content: "Saved." });
            } else {
              results.push({ type: "tool_result", tool_use_id: tu.id, content: "Unknown tool", is_error: true });
            }
          }
          messages.push({ role: "user", content: results });
        }
      } catch (err) {
        failure =
          err instanceof Anthropic.RateLimitError
            ? "Claude är överbelastad just nu. Försök igen om en stund."
            : err instanceof Anthropic.APIError
              ? `Claude svarade med fel ${err.status}.`
              : req.signal.aborted
                ? "Avbruten."
                : "Något gick fel under hämtningen.";
        console.error("fetch failed", err);
      }

      if (totalCards === 0) {
        await supabase.from("sets").delete().eq("id", setId);
        if (job) await supabase.from("fetch_jobs").update({ status: "failed", error: failure ?? "no cards" }).eq("id", job.id);
        send({ t: "error", m: failure ?? (meta?.notes || "Ingen tillförlitlig checklista hittades. Prova ett mer exakt namn eller klistra in en adress till listan.") });
      } else {
        await supabase
          .from("sets")
          .update({
            status: "ready",
            name: meta?.name || query,
            source: meta?.source || "",
            source_urls: meta?.source ? [meta.source] : [],
            notes: meta?.notes || failure || "",
          })
          .eq("id", setId);
        if (job) await supabase.from("fetch_jobs").update({ status: "done" }).eq("id", job.id);
        send({ t: "done", setId, m: `Klart: ${totalCards} kort.` });
      }
      controller.close();
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
