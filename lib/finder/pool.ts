// The gift finder's calendar mode (issue #48): one research run that returns a
// pool of 12 to 30 small gift ideas for one person, for the sender to pick from
// door by door, and a smaller "more like this" run of a few ideas like one the
// sender liked.
//
// It is the research sub-agent's loop (lib/agents/research.ts) with a bigger
// report: that one reports at most 5 ideas, and its internals are shared with
// the main agent, so the calendar has its own byte-stable prompts and report
// tool here and reuses the rest: the same Tavily client and search_web tool
// shape, Anthropic's web search when TAVILY_API_KEY is empty, the same model
// settings (MAJNU_MODEL, low effort, fallbacks), the same link check (a link
// must be a page the searches returned, or on a shop's site that came up) and
// product photos from the very page an idea links to.
//
// Caps per run, because one pool has to cover 24 doors from different shops:
// a pool may search 6 times in 5 model requests; "more like this" 3 times in 4.
// The finder's own searches keep 4 and 4.
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
import { AGENT_EFFORT, agentRequestBase, getClient } from "@/lib/agents/client"
import { describeToday } from "@/lib/agents/context"
import { echoableContent } from "@/lib/agents/history"
import { priceExample, ResearchIncomplete, ResearchRefusal, searchResultsText, type ResearchIdea } from "@/lib/agents/research"
import { httpsOnly } from "@/lib/agents/safe-url"
import { searchTavily, TavilySearchError, type SearchOptions, type SearchResult } from "@/lib/agents/tavily"
import type { GiftOption } from "./events"

export { ResearchIncomplete, ResearchRefusal }

export const MIN_POOL_IDEAS = 12
export const MAX_POOL_IDEAS = 30
export const SIMILAR_IDEAS = 6
// A pool never grows past this, however often "more like this" runs.
export const MAX_POOL_SIZE = 48

export const POOL_CAPS = {
  pool: { searches: 6, requests: 5 },
  similar: { searches: 3, requests: 4 },
} as const

const MAX_TOKENS = 16000

// How many ideas to ask for: a few more than there are doors, so a sender has
// a choice and ideas without a link can be dropped.
export function poolSize(doors: number): number {
  return Math.max(MIN_POOL_IDEAS, Math.min(MAX_POOL_IDEAS, Math.round(doors) + 4))
}

export type PoolInput = {
  mode: "pool" | "similar"
  // "Anna, the sender's girlfriend (the visitor's partner), probably about 20 to 35 years old (assumed), loves Yoga."
  recipient: string
  calendar: string // "An advent calendar with 24 doors, from 2026-12-01"
  doorBudget: string
  lastDoorBudget?: string
  country?: string // "Berlin, Germany"
  countryCode?: string // "DE"
  currency?: string // "EUR"
  language?: string // "de"
  ideas: number
  // "more like this": the idea the sender liked, and the titles already in the pool.
  similarTo?: Pick<GiftOption, "title" | "description" | "price" | "shop">
  avoid?: string[]
  now: Date
  timezone: string
}

export type PoolReport = { ideas: ResearchIdea[]; lastDoor: number | null; why: string }

// ---------- Prompts and tools (byte-stable) ----------

const POOL_RULES = `- Look for small things someone can buy online in the sender's country and that fit behind a calendar door: treats, little rituals, things to use or keep, small experiences, vouchers. Keep to the budget per door. When the brief names a bigger budget for the last door, include two or three ideas for it, and name the best of them as lastDoor.
- Spread the ideas over different shops and kinds, so the calendar does not repeat itself. Never the same product twice.
- Each idea has a short title, one or two sentences describing what it is, one sentence on why it suits this person (use what the brief says about them), a price, the shop's name, and an https link to the page where it can be bought.
- Link to a shop's page for that thing: a product page, or the shop's own page for that kind of product. Never an article, a blog post or a list of gift ideas; use those only to find shops, then search for the shop's page.
- Only use links that appeared in your search results. Never guess a URL. Leave the link out if you have none.
- Write every title, description, reason and why in the language the brief names. Never switch to the language of the search results: translate what you read. Keep brand and product names as they are.
- Write to the sender as a friend would. In languages with a formal and an informal you, use the informal one (in German du, never Sie).
- Give prices in the currency the brief names, written the way people there write prices, as in the brief's example. Use the price the search result shows; when it shows none, give a typical price marked as approximate (in German "ca. 8 €").`

export const POOL_WEB_SYSTEM_PROMPT = `You find small gift ideas for an advent calendar or a countdown on Majnu, a site where one person fills a door a day for someone they love. Search the web, then call report_ideas once with the number of ideas the brief asks for. That call is your only output: write nothing else.

- The brief says how many searches you have. Search in the language of the brief.
${POOL_RULES}`

export const POOL_TAVILY_SYSTEM_PROMPT = `You find small gift ideas for an advent calendar or a countdown on Majnu, a site where one person fills a door a day for someone they love. Search the web with search_web, then call report_ideas once with the number of ideas the brief asks for. That call is your only output: write nothing else.

- The brief says how many searches you have. Each returns up to 5 results with a title, a link and a short extract. Keep queries short and specific, in the language of the brief and in the words a shop page there would use, and include the sender's country. One search can find several ideas: a shop's page for a kind of thing counts.
- Results marked [photo] come with a product photo the sender will see next to the idea. When two results fit equally well, prefer the one with a photo.
${POOL_RULES}
- If a search fails, try once more with other words, or report with what you have.`

const REPORT_TOOL: BetaTool = {
  name: "report_ideas",
  description: "Report the calendar's gift ideas. Call this exactly once, at the end.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      ideas: {
        type: "array",
        description: "The ideas, as many as the brief asks for, each a different product",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "What the gift is, e.g. 'Lavender bath salt'" },
            description: { type: "string", description: "One or two sentences on what it is" },
            reason: { type: "string", description: "One sentence on why it suits this person" },
            price: { type: "string", description: "The price in the brief's currency, written as people there write it, or marked as approximate" },
            shop: { type: "string", description: "The shop or maker selling it" },
            url: { type: "string", description: "https link to buy it, taken from a search result" },
          },
          required: ["title", "description", "reason"],
          additionalProperties: false,
        },
      },
      lastDoor: {
        anyOf: [{ type: "integer" }, { type: "null" }],
        description: "The number of the idea that suits the last door best, counting from 1, or null if the brief names no bigger budget for it",
      },
      why: { type: "string", description: "One sentence to the sender on why that idea suits the last door, or an empty string" },
    },
    required: ["ideas", "lastDoor", "why"],
    additionalProperties: false,
  },
}

const SEARCH_TOOL: BetaTool = {
  name: "search_web",
  description: "Search the web. Returns up to 5 results, each with a title, a link and a short extract.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "A short, specific search, e.g. 'Badesalz Lavendel kaufen'" },
    },
    required: ["query"],
    additionalProperties: false,
  },
}

function toolsFor(mode: PoolInput["mode"], tavily: boolean): BetaToolUnion[] {
  if (tavily) return [SEARCH_TOOL, REPORT_TOOL]
  return [{ type: "web_search_20260209", name: "web_search", max_uses: POOL_CAPS[mode].searches }, REPORT_TOOL]
}

const NUDGE = "Call report_ideas now with the best ideas you found."

// ---------- The brief ----------

function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code
  } catch {
    return code
  }
}

export function poolPrompt(input: PoolInput): string {
  const lines = [
    describeToday(input.timezone, input.now),
    `Who it is for: ${input.recipient}`,
    `The calendar: ${input.calendar}`,
    `Budget per door: ${input.doorBudget}`,
    input.lastDoorBudget ? `Budget for the last door: ${input.lastDoorBudget}` : "Budget for the last door: the same as the others",
    `Country or city: ${input.country || `not given; the sender's timezone is ${input.timezone}`}`,
  ]
  if (input.language) {
    const name = languageName(input.language)
    lines.push(`Language: ${name} (${input.language}). Search in ${name}, and write every title, description, reason and why in ${name}.`)
  }
  if (input.currency) {
    const example = priceExample(input.currency, input.language, input.countryCode)
    lines.push(`Currency: ${input.currency}${example ? `. Prices there look like this: ${example}` : ""}.`)
  }
  if (input.mode === "similar" && input.similarTo) {
    const like = input.similarTo
    lines.push(
      `The sender liked this idea and wants more like it: ${like.title}${like.shop ? ` (${like.shop})` : ""}${like.price ? `, ${like.price}` : ""}. ${like.description}`,
      "Find ideas of the same kind or mood, but each a different product, from any shop.",
    )
  }
  if (input.avoid?.length) lines.push(`Already in the calendar's ideas, so do not repeat them: ${input.avoid.slice(0, 40).join("; ")}.`)
  lines.push(`You have at most ${POOL_CAPS[input.mode].searches} searches.`, `Report exactly ${input.ideas} ideas.`)
  return lines.join("\n")
}

// ---------- Links and images ----------

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
      if (!known || (!known.imageUrl && result.imageUrl)) seen.pages.set(key, result)
    }
  }
}

// As in research.ts: with Tavily a link must be a page the searches returned,
// or at least on a site that came up; a link the model made up is dropped.
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

// ---------- The report ----------

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
  lastDoor: z.number().nullable().optional().catch(null),
  why: z.string().trim().optional().catch(undefined),
})

function clean(text: string | undefined, max: number): string | undefined {
  const trimmed = text?.trim()
  return trimmed ? trimmed.slice(0, max) : undefined
}

export function toPoolReport(input: unknown, seen: SeenResults | undefined, wanted: number): PoolReport | null {
  const parsed = ReportInput.safeParse(input)
  if (!parsed.success) return null
  const ideas = parsed.data.ideas.slice(0, wanted).map((idea): ResearchIdea => {
    const description = clean(idea.description, 400)
    const price = clean(idea.price, 40)
    const shop = clean(idea.shop, 60)
    return {
      title: idea.title.slice(0, 120),
      reason: idea.reason.slice(0, 400),
      ...(description ? { description } : {}),
      ...(price ? { price } : {}),
      ...(shop ? { shop } : {}),
      ...checkLink(idea.url, seen),
    }
  })
  const pick = parsed.data.lastDoor == null ? null : Math.round(parsed.data.lastDoor) - 1
  return {
    ideas,
    lastDoor: pick !== null && pick >= 0 && pick < ideas.length ? pick : null,
    why: clean(parsed.data.why, 400) ?? "",
  }
}

function randomId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 10)
}

function sameIdeaKey(option: Pick<GiftOption, "title" | "url">): { url: string; title: string } {
  return { url: urlKeys(option.url)?.exact ?? option.url, title: option.title.trim().toLocaleLowerCase() }
}

// The report's ideas that have a link, as GiftOptions with ids that are stable
// within the calendar, without repeats (of each other or of `existing`), and
// the id of the one suggested for the last door.
export function toPoolOptions(
  report: PoolReport,
  existing: readonly GiftOption[] = [],
  makeId: () => string = randomId,
): { options: GiftOption[]; lastDoorId: string | null } {
  const urls = new Set<string>()
  const titles = new Set<string>()
  for (const option of existing) {
    const key = sameIdeaKey(option)
    urls.add(key.url)
    titles.add(key.title)
  }
  const options: GiftOption[] = []
  let lastDoorId: string | null = null
  report.ideas.forEach((idea, index) => {
    if (!idea.url) return
    const key = sameIdeaKey({ title: idea.title, url: idea.url })
    if (urls.has(key.url) || titles.has(key.title)) return
    urls.add(key.url)
    titles.add(key.title)
    const option: GiftOption = {
      id: makeId(),
      title: idea.title,
      description: idea.description ?? idea.reason,
      reason: idea.reason,
      ...(idea.price ? { price: idea.price } : {}),
      url: idea.url,
      ...(idea.imageUrl ? { imageUrl: idea.imageUrl } : {}),
      ...(idea.shop ? { shop: idea.shop } : {}),
    }
    if (index === report.lastDoor) lastDoorId = option.id
    options.push(option)
  })
  return { options, lastDoorId }
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
    console.warn("[calendars] tavily search failed:", reason)
    return errorResult(call.id, `The search ${reason}. Try again with other words, or call report_ideas with what you have.`)
  }
}

const SearchInput = z.object({ query: z.string().trim().min(1) })

function answerCalls(calls: BetaToolUseBlock[], search: SearchContext | undefined) {
  return Promise.all(
    calls.map((call): Promise<BetaToolResultBlockParam> | BetaToolResultBlockParam => {
      if (call.name === REPORT_TOOL.name) return errorResult(call.id, "The ideas did not match the schema. Call report_ideas again.")
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

function baseLanguage(tag: string | undefined): string | undefined {
  if (!tag) return undefined
  try {
    return new Intl.Locale(tag).language
  } catch {
    return undefined
  }
}

// One research run for a calendar. Throws ResearchRefusal when the model
// declines, ResearchIncomplete when it never reports, and the SDK's errors as
// they are.
export async function researchPool(input: PoolInput): Promise<PoolReport> {
  // Read per run: on Workers the environment is only populated during a request.
  const tavilyKey = process.env.TAVILY_API_KEY?.trim() || undefined
  const caps = POOL_CAPS[input.mode]
  const wanted = Math.max(1, Math.min(MAX_POOL_IDEAS, Math.round(input.ideas)))
  const search: SearchContext | undefined = tavilyKey
    ? {
        apiKey: tavilyKey,
        options: { country: input.countryCode, language: baseLanguage(input.language), images: true },
        seen: { pages: new Map(), hosts: new Set() },
        budget: { searches: caps.searches },
      }
    : undefined
  const system = tavilyKey ? POOL_TAVILY_SYSTEM_PROMPT : POOL_WEB_SYSTEM_PROMPT
  const tools = toolsFor(input.mode, Boolean(tavilyKey))
  const messages: BetaMessageParam[] = [{ role: "user", content: poolPrompt({ ...input, ideas: wanted }) }]
  let nudged = false

  for (let request = 0; request < caps.requests; request++) {
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
      const report = toPoolReport(reportCall.input, search?.seen, wanted)
      if (report && report.ideas.length > 0) return report
    }
    if (request === caps.requests - 1) break

    messages.push({ role: "assistant", content })
    if (calls.length > 0) {
      const results: BetaContentBlockParam[] = await answerCalls(calls, search)
      if (request === caps.requests - 2) results.push({ type: "text", text: NUDGE })
      messages.push({ role: "user", content: results })
      continue
    }
    if (message.stop_reason === "pause_turn") continue
    if (nudged) break
    nudged = true
    messages.push({ role: "user", content: NUDGE })
  }
  throw new ResearchIncomplete()
}
