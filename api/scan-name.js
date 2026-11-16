// POST /api/scan-name  { name, context?, handles?, confirmed: true }
// Claude searches the public web for pages that mention the person and returns them as JSON.
// Needs ANTHROPIC_API_KEY in the environment.
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const SYSTEM = `You help a person audit their own online footprint. They give you their own name, and optionally a place, school or employer and their usernames. Search the public web and report every page that appears to be about them or to show them, so they can decide what to ask to have removed.

How to search:
- Run many separate searches. Put the full name in quotes. Cover general web results, news, and each of these with a site: filter: instagram.com, tiktok.com, facebook.com, x.com, linkedin.com, youtube.com, reddit.com, threads.net, pinterest.com.
- Search for people-search and data-broker listings of the name.
- Search each username on its own, in quotes.
- When a place, school or employer is given, use it to tell this person apart from others with the same name.

What to report:
- Only pages you actually saw in search results. Never invent or guess a URL.
- Rate each page: "strong" when the name and the extra details line up, "possible" when only the name matches, "weak" when it is probably someone else. Leave out pages that are clearly about a different person, such as a celebrity with the same name.
- In the summary, say in one sentence what the page is and what it shows about the person. If a page exposes a home address, phone number or similar, say that it does without repeating the detail itself.
- When you have finished searching, call report_findings exactly once. An empty results list is a valid answer.`;

const REPORT_TOOL = {
  name: "report_findings",
  description: "Hand back every page found, once all searching is done.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["results", "queries"],
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "url", "site", "kind", "match", "summary"],
          properties: {
            title: { type: "string" },
            url: { type: "string" },
            site: { type: "string", description: "Plain site name, e.g. Instagram" },
            kind: { type: "string", enum: ["social", "news", "video", "image", "data broker", "forum", "other"] },
            match: { type: "string", enum: ["strong", "possible", "weak"] },
            summary: { type: "string" },
          },
        },
      },
      queries: { type: "array", items: { type: "string" }, description: "The searches that were run" },
    },
  },
};

const json = (body, status = 200) => Response.json(body, { status });

function isHttpUrl(u) {
  try { return /^https?:$/.test(new URL(u).protocol); } catch { return false; }
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "Send the name as JSON." }, 400); }

  const name = String(body.name ?? "").trim().slice(0, 100);
  const context = String(body.context ?? "").trim().slice(0, 100);
  const handles = (Array.isArray(body.handles) ? body.handles : []).map((h) => String(h).trim().slice(0, 40)).filter(Boolean).slice(0, 6);
  if (name.length < 3) return json({ error: "Type your full name first." }, 400);
  if (body.confirmed !== true) return json({ error: "Confirm that this is your own name first." }, 400);

  const ask = [
    `My full name: ${name}`,
    context && `To tell me apart from others with my name: ${context}`,
    handles.length && `My usernames: ${handles.join(", ")}`,
    "Find where I show up online.",
  ].filter(Boolean).join("\n");
  const messages = [{ role: "user", content: ask }];

  try {
    for (let turn = 0; turn < 6; turn++) {
      const message = await client.beta.messages.stream({
        model: "claude-opus-5-5",
        max_tokens: 32000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: SYSTEM,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 20 }, REPORT_TOOL],
        messages,
      }).finalMessage();

      if (message.stop_reason === "refusal") return json({ error: "The search was declined for this name." }, 422);

      const report = message.content.find((b) => b.type === "tool_use" && b.name === "report_findings");
      if (report) {
        const results = (report.input?.results ?? []).filter((r) => r && isHttpUrl(r.url)).slice(0, 80);
        return json({ results, queries: report.input?.queries ?? [] });
      }

      messages.push({ role: "assistant", content: message.content });
      // pause_turn: the server paused a long search turn, so send it back unchanged to continue.
      if (message.stop_reason !== "pause_turn") {
        messages.push({ role: "user", content: "Call report_findings now with everything you found." });
      }
    }
    return json({ error: "The search ran out of time before finishing. Try again." }, 504);
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return json({ error: "The server's ANTHROPIC_API_KEY is missing or wrong." }, 500);
    if (err instanceof Anthropic.RateLimitError) return json({ error: "Too many scans right now. Try again in a minute." }, 429);
    if (err instanceof Anthropic.APIConnectionError) return json({ error: "Could not reach the search service. Try again." }, 502);
    if (err instanceof Anthropic.APIError) return json({ error: `The search service answered ${err.status ?? "with an error"}.` }, 502);
    if (/api key|apiKey|authToken/i.test(String(err?.message))) return json({ error: "The server has no ANTHROPIC_API_KEY set." }, 500);
    throw err;
  }
}
