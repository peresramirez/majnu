// Research sub-agent (issues #10 and #31): its own short tool loop that searches
// the web and ends in one report_gifts call. The caller gets only the ideas
// back, never the search results.
//
// Two callers:
// - the main agent's research_gifts tool, through researchGifts(), which
//   returns 3 to 5 short ideas;
// - the gift finder, through researchGiftReport(), which also asks for a
//   description, the shop, a product image and one recommendation, all in the
//   visitor's language with prices in their currency.
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
import { type SearchOptions, type SearchResult, searchTavily, TavilySearchError } from "./tavily"

export type ResearchInput = {
  recipient: string
  occasion: string
  budget?: string
  // Where the gift will be bought or used, as words: "Berlin, Germany".
  country?: string
  now: Date
  timezone: string
  // The gift finder's additions. Without them research behaves as it did for
  // the main agent: ideas in the language of the brief, prices as found.
  // BCP 47 or ISO 639-1 ("de-DE", "de"): every word of the report is written in it.
  language?: string
  // ISO 3166-1 alpha-2 ("DE"): Tavily ranks results from that country higher.
  countryCode?: string
  // ISO 4217 ("EUR"): the currency prices are given in.
  currency?: string
  // How many ideas to report, 1 to 5. Unset: 3 to 5.
  ideas?: number
  // Ask Tavily for product images.
  images?: boolean
}

// One idea as the gift finder shows it. imageUrl is only ever an image Tavily
// returned for the very page the idea links to.
export type ResearchIdea = GiftIdea & { description?: string; shop?: string; imageUrl?: string }

export type ResearchReport = {
  ideas: ResearchIdea[]
  // Index into `ideas` of the one the researcher recommends.
  recommended: number
  // Why that one, written to the sender. Empty if the researcher gave no reason.
  why: string
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
const MAX_IDEAS = 5

// The two system prompts are constants, so each mode's prompt is byte-stable.
// Everything that changes per request (language, country, currency, how many
// ideas) is in the user message.

const WRITING_RULES = `- Write every title, description, reason and why in the language the brief names, or in the language of the brief when it names none. Never switch to the language of the search results: translate what you read. Keep brand and product names as they are.
- Give prices in the currency the brief names, written the way people there write prices, as in the brief's example. If a shop shows only another currency, give its price as shown rather than converting it.`

const IDEA_RULES = `- Each idea has a short title, one or two sentences describing what it is, one sentence on why it suits this person (use what the brief says about them), a typical price, the shop's name, and an https link to the page where it can be bought or booked.
- Only use links that appeared in your search results. Never guess a URL. Leave the link out if you have none.
- Stay within the budget when there is one. Mix kinds: something to keep, something to do, something small and personal.
- Recommend the one idea that fits this person best, and say why in one or two sentences, written to the sender.`

// Anthropic's server-side web search (no TAVILY_API_KEY).
export const RESEARCH_SYSTEM_PROMPT = `You find gift ideas for one person, for Majnu, a site where people make personal gift pages. Search the web, then call report_gifts once with the number of ideas the brief asks for (3 to 5 if it does not say). That call is your only output: write nothing else.

- Search a few times at most, in the language of the brief. Look for specific things someone can buy or book online in the sender's country: products, experiences, vouchers, from well-known shops or the maker's own site.
${IDEA_RULES}
${WRITING_RULES}`

// Tavily through the search_web tool.
export const TAVILY_RESEARCH_SYSTEM_PROMPT = `You find gift ideas for one person, for Majnu, a site where people make personal gift pages. Search the web with search_web, then call report_gifts once with the number of ideas the brief asks for (3 to 5 if it does not say). That call is your only output: write nothing else.

- You have at most 4 searches. Each returns up to 5 results with a title, a link and a short extract. Keep queries short and specific, in the language of the brief and in the words a shop page there would use, and include the sender's country or city.
- Look for specific things someone can buy or book online in the sender's country: products, experiences, vouchers, from well-known shops or the maker's own site. Product pages are better than lists of ideas.
- Results marked [photo] come with a product photo the sender will see next to the idea. When two results fit equally well, prefer the one with a photo.
${IDEA_RULES}
${WRITING_RULES}
- If a search fails, try once more with other words, or report with what you have.`

const REPORT_TOOL: BetaTool = {
  name: "report_gifts",
  description: "Report the gift ideas. Call this exactly once, at the end, best first.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      ideas: {
        type: "array",
        description: "The ideas, best first: as many as the brief asks for, 3 to 5 if it does not say",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "What the gift is, e.g. 'Pottery class for two'" },
            description: { type: "string", description: "One or two sentences on what it is" },
            reason: { type: "string", description: "One sentence on why it suits this person" },
            price: { type: "string", description: "Typical price in the brief's currency, written as people there write it, e.g. '39,90 €'" },
            shop: { type: "string", description: "The shop or maker selling it, e.g. 'Thalia'" },
            url: { type: "string", description: "https link to buy or book it, taken from a search result" },
          },
          required: ["title", "description", "reason"],
          additionalProperties: false,
        },
      },
      recommended: { type: "integer", description: "The number of the idea you recommend most, counting from 1" },
      why: { type: "string", description: "One or two sentences to the sender on why you recommend that one" },
    },
    required: ["ideas", "recommended", "why"],
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

const NUDGE = "Call report_gifts now with the best ideas you found."

// Lenient on the fields the report did not always have, so a slightly off
// answer still gives ideas rather than a retry.
const ReportInput = z.object({
  ideas: z
    .array(
      z.object({
        title: z.string().trim().min(1),
        reason: z.string().trim().min(1),
        description: z.string().trim().optional().catch(undefined),
        price: z.string().trim().optional().catch(undefined),
        shop: z.string().trim().optional().catch(undefined),
        url: z.string().trim().optional().catch(undefined),
      }),
    )
    .min(1),
  recommended: z.number().optional().catch(undefined),
  why: z.string().trim().optional().catch(undefined),
})

const SearchInput = z.object({ query: z.string().trim().min(1) })

// ---------- Links and images ----------

// What the searches of one run returned, to check links and find their images.
// Undefined in Anthropic's web search mode, where we do not see the results.
type SeenResults = { pages: Map<string, SearchResult>; hosts: Set<string> }

function urlKeys(url: string): { exact: string; page: string; host: string } | null {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase().replace(/^www\./, "")
    const path = u.pathname.replace(/\/+$/, "")
    return { exact: `${host}${path}${u.search}`, page: `${host}${path}`, host }
  } catch {
    return null
  }
}

function remember(seen: SeenResults, results: SearchResult[]) {
  for (const result of results) {
    const keys = urlKeys(result.url)
    if (!keys) continue
    seen.hosts.add(keys.host)
    for (const key of [keys.exact, keys.page]) {
      const known = seen.pages.get(key)
      // Keep the first result for a page, but let a later one add an image.
      if (!known || (!known.imageUrl && result.imageUrl)) seen.pages.set(key, result)
    }
  }
}

// The link an idea may keep, and the image that goes with it. With Tavily, a
// link must be a page from the results or at least on a shop's site that came
// up; a link the model made up is dropped.
function checkLink(url: string | undefined, seen: SeenResults | undefined): { url?: string; imageUrl?: string } {
  const safe = httpsOnly(url)
  if (!safe) return {}
  if (!seen) return { url: safe }
  const keys = urlKeys(safe)
  if (!keys) return {}
  const page = seen.pages.get(keys.exact) ?? seen.pages.get(keys.page)
  if (page) return { url: safe, ...(page.imageUrl ? { imageUrl: page.imageUrl } : {}) }
  return seen.hosts.has(keys.host) ? { url: safe } : {}
}

// ---------- Cleaning the report ----------

function clean(text: string | undefined, max: number): string | undefined {
  const trimmed = text?.trim()
  return trimmed ? trimmed.slice(0, max) : undefined
}

function toReport(input: unknown, seen: SeenResults | undefined, wanted: number): ResearchReport | null {
  const parsed = ReportInput.safeParse(input)
  if (!parsed.success) return null
  const ideas = parsed.data.ideas.slice(0, Math.min(wanted, MAX_IDEAS)).map((idea): ResearchIdea => {
    const link = checkLink(idea.url, seen)
    const description = clean(idea.description, 400)
    const price = clean(idea.price, 40)
    const shop = clean(idea.shop, 60)
    return {
      title: idea.title.slice(0, 120),
      reason: idea.reason.slice(0, 400),
      ...(description ? { description } : {}),
      ...(price ? { price } : {}),
      ...(shop ? { shop } : {}),
      ...link,
    }
  })
  const pick = Math.round(parsed.data.recommended ?? 1) - 1
  return {
    ideas,
    recommended: pick >= 0 && pick < ideas.length ? pick : 0,
    why: clean(parsed.data.why, 400) ?? "",
  }
}

function toShortIdeas(ideas: ResearchIdea[]): GiftIdea[] {
  return ideas.map(({ title, reason, price, url }) => ({ title, reason, ...(price ? { price } : {}), ...(url ? { url } : {}) }))
}

// Ideas from a report_gifts input, cleaned for the main agent's chat cards;
// null when the input does not fit.
export function toGiftIdeas(input: unknown): GiftIdea[] | null {
  const report = toReport(input, undefined, MAX_IDEAS)
  return report ? toShortIdeas(report.ideas) : null
}

// ---------- The brief ----------

function baseLanguage(tag: string | undefined): string | undefined {
  if (!tag) return undefined
  try {
    return new Intl.Locale(tag).language
  } catch {
    return undefined
  }
}

function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code
  } catch {
    return code
  }
}

// "39,90 €" for German in Germany: how a price looks where the sender is.
export function priceExample(currency: string, language?: string, countryCode?: string): string | undefined {
  const lang = baseLanguage(language) ?? "en"
  for (const locale of countryCode ? [`${lang}-${countryCode}`, lang] : [lang]) {
    try {
      return new Intl.NumberFormat(locale, { style: "currency", currency }).format(39.9)
    } catch {
      // An unknown locale or currency: try the next one, or give no example.
    }
  }
  return undefined
}

export function researchPrompt(input: ResearchInput): string {
  const lines = [
    describeToday(input.timezone, input.now),
    `Who it is for: ${input.recipient}`,
    `Occasion: ${input.occasion}`,
    `Budget: ${input.budget || "not given"}`,
    `Country or city: ${input.country || `not given; the sender's timezone is ${input.timezone}`}`,
  ]
  const lang = baseLanguage(input.language)
  if (lang) {
    const name = languageName(lang)
    lines.push(`Language: ${name} (${lang}). Search in ${name}, and write every title, description, reason and why in ${name}.`)
  }
  if (input.currency) {
    const example = priceExample(input.currency, input.language, input.countryCode)
    lines.push(`Currency: ${input.currency}${example ? `. Prices there look like this: ${example}` : ""}.`)
  }
  if (input.ideas) lines.push(`Report exactly ${input.ideas} ideas.`)
  return lines.join("\n")
}

// Search results as the model sees them: numbered, one title, link and extract each.
export function searchResultsText(results: SearchResult[]): string {
  if (results.length === 0) return "No results. Try other words."
  return results
    .map((r, i) => [`${i + 1}. ${r.title || "(no title)"}${r.imageUrl ? " [photo]" : ""}`, r.url, r.extract].filter(Boolean).join("\n"))
    .join("\n\n")
}

// ---------- The loop ----------

function errorResult(toolUseId: string, text: string): BetaToolResultBlockParam {
  return { type: "tool_result", tool_use_id: toolUseId, is_error: true, content: text }
}

type SearchContext = { apiKey: string; options: SearchOptions; seen: SeenResults; budget: { searches: number } }

async function runSearch(call: BetaToolUseBlock, query: string, search: SearchContext): Promise<BetaToolResultBlockParam> {
  try {
    const results = await searchTavily(query, search.apiKey, search.options)
    remember(search.seen, results)
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
function answerCalls(calls: BetaToolUseBlock[], search: SearchContext | undefined) {
  return Promise.all(
    calls.map((call): Promise<BetaToolResultBlockParam> | BetaToolResultBlockParam => {
      if (call.name === REPORT_TOOL.name) {
        return errorResult(call.id, "The ideas did not match the schema. Call report_gifts again.")
      }
      if (call.name === SEARCH_TOOL.name && search) {
        const input = SearchInput.safeParse(call.input)
        if (!input.success) return errorResult(call.id, "search_web needs a query.")
        if (search.budget.searches <= 0) return errorResult(call.id, `No searches left. ${NUDGE}`)
        search.budget.searches--
        return runSearch(call, input.data.query, search)
      }
      return errorResult(call.id, `There is no tool called ${call.name}.`)
    }),
  )
}

// The full report, for the gift finder.
export async function researchGiftReport(input: ResearchInput): Promise<ResearchReport> {
  // Read per run: on Workers the environment is only populated during a request.
  const tavilyKey = process.env.TAVILY_API_KEY?.trim() || undefined
  const system = tavilyKey ? TAVILY_RESEARCH_SYSTEM_PROMPT : RESEARCH_SYSTEM_PROMPT
  const tools = tavilyKey ? TAVILY_TOOLS : ANTHROPIC_TOOLS
  const wanted = input.ideas ? Math.max(1, Math.min(MAX_IDEAS, Math.round(input.ideas))) : MAX_IDEAS
  const search: SearchContext | undefined = tavilyKey
    ? {
        apiKey: tavilyKey,
        options: { country: input.countryCode, language: baseLanguage(input.language), images: input.images === true },
        seen: { pages: new Map(), hosts: new Set() },
        budget: { searches: MAX_SEARCHES },
      }
    : undefined
  const messages: BetaMessageParam[] = [{ role: "user", content: researchPrompt(input) }]
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
    const reportCall = calls.find((call) => call.name === REPORT_TOOL.name)
    if (reportCall) {
      const report = toReport(reportCall.input, search?.seen, wanted)
      if (report && report.ideas.length > 0) return report
    }
    // Nothing more can be asked of the model, so run no more searches.
    if (request === MAX_REQUESTS - 1) break

    messages.push({ role: "assistant", content })
    if (calls.length > 0) {
      // Search results, or the reason a report or search failed. Before the last
      // request, also ask for the report.
      const results: BetaContentBlockParam[] = await answerCalls(calls, search)
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

// 3 to 5 short ideas, for the main agent's research_gifts tool.
export async function researchGifts(input: ResearchInput): Promise<GiftIdea[]> {
  const report = await researchGiftReport(input)
  return toShortIdeas(report.ideas)
}
