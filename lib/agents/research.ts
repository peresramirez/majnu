// Research sub-agent (issue #10): its own short tool loop with Anthropic's
// server-side web search, ending in one report_gifts call with 3 to 5 ideas.
// The main agent gets only the ideas back, never the search results.
import "server-only"
import type { BetaMessageParam, BetaTool, BetaToolUnion } from "@anthropic-ai/sdk/resources/beta"
import * as z from "zod/v4"
import { AGENT_EFFORT, agentRequestBase, getClient } from "./client"
import { describeToday } from "./context"
import type { GiftIdea } from "./events"
import { echoableContent } from "./history"
import { httpsOnly } from "./safe-url"

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

const MAX_SEARCHES = 4
// Requests per research run: searching, a paused turn resumed, one nudge to report.
const MAX_REQUESTS = 4
const MAX_TOKENS = 16000

export const RESEARCH_SYSTEM_PROMPT = `You find gift ideas for one person, for Majnu, a site where people make personal gift pages. Search the web, then call report_gifts once with 3 to 5 ideas. That call is your only output: write nothing else.

- Search a few times at most. Look for specific things someone can buy or book online in the sender's country: products, experiences, vouchers, from well-known shops or the maker's own site.
- Each idea has a short title, one sentence on why it suits this person (use what the brief says about them), a typical price with its currency, and an https link to a page where it can be bought or booked.
- Only use links that appeared in your search results. Never guess a URL. Leave the link out if you have none.
- Stay within the budget when there is one. Mix kinds: something to keep, something to do, something small and personal.
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

const TOOLS: BetaToolUnion[] = [{ type: "web_search_20260209", name: "web_search", max_uses: MAX_SEARCHES }, REPORT_TOOL]

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

export async function researchGifts(input: ResearchInput): Promise<GiftIdea[]> {
  const messages: BetaMessageParam[] = [{ role: "user", content: userPrompt(input) }]
  let nudged = false

  for (let request = 0; request < MAX_REQUESTS; request++) {
    const message = await getClient().beta.messages.create({
      ...agentRequestBase(),
      max_tokens: MAX_TOKENS,
      system: RESEARCH_SYSTEM_PROMPT,
      tools: TOOLS,
      output_config: { effort: AGENT_EFFORT },
      messages,
    })
    if (message.stop_reason === "refusal") throw new ResearchRefusal()

    const content = echoableContent(message.content)
    const report = content.find((block) => block.type === "tool_use" && block.name === "report_gifts")
    if (report && report.type === "tool_use") {
      const ideas = toGiftIdeas(report.input)
      if (ideas && ideas.length > 0) return ideas
      // Ask for the report again, once, with the reason.
      messages.push(
        { role: "assistant", content },
        {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: report.id, is_error: true, content: "The ideas did not match the schema. Call report_gifts again." },
          ],
        },
      )
      continue
    }

    messages.push({ role: "assistant", content })
    // A long server-side search turn can pause; sending it back lets the server continue.
    if (message.stop_reason === "pause_turn") continue
    if (nudged) break
    nudged = true
    messages.push({ role: "user", content: "Call report_gifts now with the best 3 to 5 ideas you found." })
  }
  throw new ResearchIncomplete()
}
