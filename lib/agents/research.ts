// Research sub-agent (issue #10): its own short tool loop that searches the web
// and ends in one report_gifts call with 3 to 5 ideas. The main agent gets only
// the ideas back, never the search results.
//
// Search runs on Tavily (our client tool search_web, see tavily.ts) when
// TAVILY_API_KEY is set, and on Anthropic's server-side web search otherwise.
// Both modes have the same caps: 4 searches and 4 model requests per run.
import "server-only"
import type {
  BetaContentBlockParam,
  BetaMessageParam,
  BetaTool,
  BetaToolResultBlockParam,
  BetaToolUnion,
  BetaToolUseBlock,
} from "@anthropic-ai/sdk/resources/beta"
import * as z from "zod/v4"
import { AGENT_EFFORT, agentRequestBase, getClient } from "./client"
import { describeToday } from "./context"
import type { GiftIdea } from "./events"
import { echoableContent } from "./history"
import { httpsOnly } from "./safe-url"
import { type SearchResult, searchTavily, TavilySearchError } from "./tavily"

export type ResearchInput = {
  recipient: string
  occasion: string
  budget?: string
  country?: string
  now: Date
  timezone: string
}

export class ResearchRefusal extends Error {
  constructor() {
    super("The research agent declined this request")
    this.name = "ResearchRefusal"
  }
}

export class ResearchIncomplete extends Error {
  constructor() {
    super("The research agent finished without reporting ideas")
    this.name = "ResearchIncomplete"
  }
}

export const MAX_SEARCHES = 4
// Requests per research run: searching, a paused turn resumed or search results
// answered, one nudge to report.
export const MAX_REQUESTS = 4
const MAX_TOKENS = 16000

// The two system prompts are constants, so each mode's prompt is byte-stable.

// Anthropic's server-side web search (no TAVILY_API_KEY).
export const RESEARCH_SYSTEM_PROMPT = `You find gift ideas for one person, for Majnu, a site where people make personal gift pages. Search the web, then call report_gifts once with 3 to 5 ideas. That call is your only output: write nothing else.

- Search a few times at most. Look for specific things someone can buy or book online in the sender's country: products, experiences, vouchers, from well-known shops or the maker's own site.
- Each idea has a short title, one sentence on why it suits this person (use what the brief says about them), a typical price with its currency, and an https link to a page where it can be bought or booked.
- Only use links that appeared in your search results. Never guess a URL. Leave the link out if you have none.
- Stay within the budget when there is one. Mix kinds: something to keep, something to do, something small and personal.
- Write titles and reasons in the language of the brief.`

// Tavily through the search_web tool.
export const TAVILY_RESEARCH_SYSTEM_PROMPT = `You find gift ideas for one person, for Majnu, a site where people make personal gift pages. Search the web with search_web, then call report_gifts once with 3 to 5 ideas. That call is your only output: write nothing else.

- You have at most 4 searches. Each returns up to 5 results with a title, a link and a short extract. Keep queries short and specific, in the words a shop page would use, and include the sender's country or city.
- Look for specific things someone can buy or book online in the sender's country: products, experiences, vouchers, from well-known shops or the maker's own site.
- Each idea has a short title, one sentence on why it suits this person (use what the brief says about them), a typical price with its currency, and an https link to a page where it can be bought or booked.
- Only use links that appeared in your search results. Never guess a URL. Leave the link out if you have none.
- Stay within the budget when there is one. Mix kinds: something to keep, something to do, something small and personal.
- If a search fails, try once more with other words, or report with what you have.
- Write titles and reasons in the language of the brief.`

const REPORT_TOOL: BetaTool = {
  name: "report_gifts",
  description: "Report the gift ideas. Call this exactly once, at the end, with 3 to 5 ideas, best first.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      ideas: {
        type: "array",
        description: "3 to 5 ideas, best first",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "What the gift is, e.g. 'Pottery class for two'" },
            reason: { type: "string", description: "One sentence on why it suits this person" },
            price: { type: "string", description: "Typical price with currency, e.g. '€45'" },
            url: { type: "string", description: "https link to buy or book it, taken from a search result" },
          },
          required: ["title", "reason"],
          additionalProperties: false,
        },
      },
    },
    required: ["ideas"],
    additionalProperties: false,
  },
}

const SEARCH_TOOL: BetaTool = {
  name: "search_web",
  description: "Search the web. Returns up to 5 results, each with a title, a link and a short extract. At most 4 searches per run.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "A short, specific search, e.g. 'pottery class for two Berlin voucher'" },
    },
    required: ["query"],
    additionalProperties: false,
  },
}

const ANTHROPIC_TOOLS: BetaToolUnion[] = [{ type: "web_search_20260209", name: "web_search", max_uses: MAX_SEARCHES }, REPORT_TOOL]
const TAVILY_TOOLS: BetaToolUnion[] = [SEARCH_TOOL, REPORT_TOOL]

const NUDGE = "Call report_gifts now with the best 3 to 5 ideas you found."

const ReportInput = z.object({
  ideas: z
    .array(
      z.object({
        title: z.string().trim().min(1),
        reason: z.string().trim().min(1),
        price: z.string().trim().optional(),
        url: z.string().trim().optional(),
      }),
    )
    .min(1),
})

const SearchInput = z.object({ query: z.string().trim().min(1) })

// Ideas from a report_gifts input, cleaned for the UI; null when the input does not fit.
export function toGiftIdeas(input: unknown): GiftIdea[] | null {
  const parsed = ReportInput.safeParse(input)
  if (!parsed.success) return null
  return parsed.data.ideas.slice(0, 5).map((idea) => {
    const url = httpsOnly(idea.url)
    return {
      title: idea.title.slice(0, 120),
      reason: idea.reason.slice(0, 400),
      ...(idea.price ? { price: idea.price.slice(0, 40) } : {}),
      ...(url ? { url } : {}),
    }
  })
}

function userPrompt(input: ResearchInput): string {
  return [
    describeToday(input.timezone, input.now),
    `Who it is for: ${input.recipient}`,
    `Occasion: ${input.occasion}`,
    `Budget: ${input.budget || "not given"}`,
    `Country or city: ${input.country || `not given; the sender's timezone is ${input.timezone}`}`,
  ].join("\n")
}

// Search results as the model sees them: numbered, one title, link and extract each.
export function searchResultsText(results: SearchResult[]): string {
  if (results.length === 0) return "No results. Try other words."
  return results.map((r, i) => [`${i + 1}. ${r.title || "(no title)"}`, r.url, r.extract].filter(Boolean).join("\n")).join("\n\n")
}

function errorResult(toolUseId: string, text: string): BetaToolResultBlockParam {
  return { type: "tool_result", tool_use_id: toolUseId, is_error: true, content: text }
}

async function runSearch(call: BetaToolUseBlock, query: string, apiKey: string): Promise<BetaToolResultBlockParam> {
  try {
    const results = await searchTavily(query, apiKey)
    return { type: "tool_result", tool_use_id: call.id, content: searchResultsText(results) }
  } catch (error) {
    const reason = error instanceof TavilySearchError ? error.message : "failed"
    // The query describes the recipient, so it stays out of the logs.
    console.warn("[agents] tavily search failed:", reason)
    return errorResult(call.id, `The search ${reason}. Try again with other words, or call report_gifts with what you have.`)
  }
}

// A result for every client tool call in one reply, as the API requires. Search
// slots are taken in the order the calls appear, before any search starts.
function answerCalls(calls: BetaToolUseBlock[], tavilyKey: string | undefined, budget: { searches: number }) {
  return Promise.all(
    calls.map((call): Promise<BetaToolResultBlockParam> | BetaToolResultBlockParam => {
      if (call.name === REPORT_TOOL.name) {
        return errorResult(call.id, "The ideas did not match the schema. Call report_gifts again.")
      }
      if (call.name === SEARCH_TOOL.name && tavilyKey) {
        const input = SearchInput.safeParse(call.input)
        if (!input.success) return errorResult(call.id, "search_web needs a query.")
        if (budget.searches <= 0) return errorResult(call.id, `No searches left. ${NUDGE}`)
        budget.searches--
        return runSearch(call, input.data.query, tavilyKey)
      }
      return errorResult(call.id, `There is no tool called ${call.name}.`)
    }),
  )
}

export async function researchGifts(input: ResearchInput): Promise<GiftIdea[]> {
  // Read per run: on Workers the environment is only populated during a request.
  const tavilyKey = process.env.TAVILY_API_KEY?.trim() || undefined
  const system = tavilyKey ? TAVILY_RESEARCH_SYSTEM_PROMPT : RESEARCH_SYSTEM_PROMPT
  const tools = tavilyKey ? TAVILY_TOOLS : ANTHROPIC_TOOLS
  const budget = { searches: MAX_SEARCHES }
  const messages: BetaMessageParam[] = [{ role: "user", content: userPrompt(input) }]
  let nudged = false

  for (let request = 0; request < MAX_REQUESTS; request++) {
    const message = await getClient().beta.messages.create({
      ...agentRequestBase(),
      max_tokens: MAX_TOKENS,
      system,
      tools,
      output_config: { effort: AGENT_EFFORT },
      messages,
    })
    if (message.stop_reason === "refusal") throw new ResearchRefusal()

    const content = echoableContent(message.content)
    const calls = content.filter((block): block is BetaToolUseBlock => block.type === "tool_use")
    const report = calls.find((call) => call.name === REPORT_TOOL.name)
    if (report) {
      const ideas = toGiftIdeas(report.input)
      if (ideas && ideas.length > 0) return ideas
    }
    // Nothing more can be asked of the model, so run no more searches.
    if (request === MAX_REQUESTS - 1) break

    messages.push({ role: "assistant", content })
    if (calls.length > 0) {
      // Search results, or the reason a report or search failed. Before the last
      // request, also ask for the report.
      const results: BetaContentBlockParam[] = await answerCalls(calls, tavilyKey, budget)
      if (request === MAX_REQUESTS - 2) results.push({ type: "text", text: NUDGE })
      messages.push({ role: "user", content: results })
      continue
    }
    // A long server-side search turn can pause; sending it back lets the server continue.
    if (message.stop_reason === "pause_turn") continue
    if (nudged) break
    nudged = true
    messages.push({ role: "user", content: NUDGE })
  }
  throw new ResearchIncomplete()
}
