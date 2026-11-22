# Letters chat: the main agent and its sub-agents

## What it does

A signed-in sender opens the **Create** tab and chats with Majnu about the person a gift is for. Majnu asks one thing at a time, suggests two or three templates as cards, can look for gift ideas on the web, and then writes the whole page. The page appears in a live preview next to the chat, and every later message can change it. The sender never sees JSON, tool names or template ids: only a conversation, cards and a preview.

## How it works

```mermaid
flowchart LR
  browser["Create tab<br/>use-letter-chat.ts"] -->|"POST /api/chat"| route["Chat route<br/>app/api/chat/route.ts"]
  route --> limits["Spending guard<br/>lib/limits.ts"]
  route --> store["Letter store<br/>lib/letters/store.ts"]
  route --> main["Main agent<br/>lib/agents/main.ts"]
  main <-->|"streamed Messages API"| anthropic[("Anthropic API")]
  main --> tools["Tools<br/>lib/agents/tools.ts"]
  tools -->|"build_letter, edit_letter"| builder["Builder sub-agent<br/>lib/agents/builder.ts"]
  tools -->|research_gifts| research["Research sub-agent<br/>lib/agents/research.ts"]
  builder <--> anthropic
  research <--> anthropic
  research -->|"search_web, if TAVILY_API_KEY is set"| tavily[("Tavily Search API")]
  tools -->|saveLetterContent| db[("Supabase<br/>letters")]
  store --> db
  route -.->|"NDJSON events"| browser
```

One message, in order:

1. The browser posts `{ letterId?, message, timezone }` to `POST /api/chat` ([`use-letter-chat.ts`](../../components/create/use-letter-chat.ts)). The timezone comes from `Intl.DateTimeFormat().resolvedOptions()`.
2. The route checks the session (401 without one) and validates the body with zod. A message over 4,000 characters gets a 400 with "That message is too long".
3. **Existing gift:** `getMyLetter(letterId)` loads the letter and its stored conversation through the signed-in user's client, so row-level security returns nothing for someone else's letter (404). **New gift:** `canCreateLetter()` checks the daily limit, then `createLetter()` inserts an empty letter with a server-made slug.
4. The response starts streaming. For a new gift the first event is `letter`, and the browser moves to `/create/<id>` with `history.replaceState` while the reply keeps streaming.
5. `canSendChatTurn(letterId)` counts the sender's messages in the stored conversation. At 40 it emits a `limit` event and stops.
6. `runMainAgent()` runs the tool loop (below). Text deltas, tool status lines, template cards, gift ideas and preview reloads stream to the browser as they happen.
7. If the turn produced at least one assistant message, the route saves the loaded history plus this turn's messages with `saveChat()`. Then it emits `done` and closes the stream.
8. The whole turn is registered with the Worker's `ctx.waitUntil()`, so a sender who closes the page mid-reply still gets the letter built and the conversation saved.

### The main agent's tool loop

[`runMainAgent()`](../../lib/agents/main.ts) is written by hand on `client.beta.messages.stream()`, not on the SDK's `toolRunner`. In SDK 1.12.0 the runner keeps a server-side thread and appends every reply itself; the route needs to decide what is stored. It leaves out a refused reply, gives a tool call cut off at `max_tokens` an error result so the history stays valid, and applies the fallback rule in [`history.ts`](../../lib/agents/history.ts) before a reply is replayed.

For each model request (at most 6 per sender message):

- The request carries the shared fields from [`client.ts`](../../lib/agents/client.ts), `max_tokens: 8192`, the system prompt, the four tools, `output_config: { effort: "low" }` and a top-level `cache_control: { type: "ephemeral" }`, which caches the whole prefix. Later requests in the loop, and the next message if it comes within five minutes, read that prefix back from the cache.
- While the reply streams, the start of a `tool_use` block emits a `tool` event with status `start`, and text deltas emit `text` events. Separate text blocks are joined with a blank line, the same way the stored conversation is shown again later.
- `stop_reason: "refusal"`: every model in the fallback chain declined. The partial reply is dropped, any started tools are marked `error`, and a `refusal` event says "I can't help with that one…".
- `pause_turn`: the reply is appended and sent back as it is, and the server continues it.
- No tool calls: the turn is done.
- Tool calls with any stop reason other than `tool_use` (cut off at `max_tokens`): nothing runs. Each call gets an `is_error` result asking for a shorter call.
- Otherwise the tools run **one at a time**, so a build and an edit in the same reply cannot race, and their results go back as the next user message.

When the six requests are used up, the turn ends and what was done so far is kept.

### Tools

Defined once at module load in [`tools.ts`](../../lib/agents/tools.ts), with input schemas generated from zod. Their order and wording never change, because tools are part of the cached prefix that thinking blocks are bound to.

| Tool | What it does | Gate | Status line |
|---|---|---|---|
| `suggest_templates` | Emits a `templates` event with 1 to 4 template ids; the chat shows cards. Tapping one sends an ordinary message, `Use the "Classic envelope" template.` | None | Picking a few templates… |
| `research_gifts` | Runs the research sub-agent and emits a `gifts` event with the ideas. The result goes back to the model as JSON, so the cards can be shown again when the chat is reopened | None | Looking for gift ideas… |
| `build_letter` | Runs the builder on a full brief, saves the content and emits `preview` | Calendars need a real account (a guest is asked to sign up) | Writing your letter… |
| `edit_letter` | Runs the builder on the current content and the requested change, saves it and emits `preview`. Can move content to another template of the same kind only | Calendars need a real account | Making your changes… |

A tool that hits a plan gate emits a `limit` event and returns "Not done: …" to the model, which tells the sender kindly and carries on. A tool that throws returns an error result, so a `tool_use` never lacks its `tool_result`. A builder or research refusal returns "The writer declined this request".

### The builder sub-agent

[`buildContent()`](../../lib/agents/builder.ts) is one `client.beta.messages.parse()` call with `output_config: { effort: "low", format: betaZodOutputFormat(schema) }` and `max_tokens: 16000`. The schema is `LetterContent` or `CalendarContent` from [`schema.ts`](../../lib/letters/schema.ts), chosen by the template's kind. The beta namespace is used because `fallbacks` and `block_binding` exist only there. The user message carries today's date in the sender's timezone, the template, and either the brief or the current content and the change.

The output is then checked against rules the schema cannot express ([`checkContent()`](../../lib/agents/builder.ts)): 1 to 6 body paragraphs; an event on `wedding-invite`, `party-invite` and `wedding-envelope-3d` (`EVENT_TEMPLATES`); at least one gift on `gift-reveal` and `gift-box-3d` (`GIFT_TEMPLATES`), and on `party-box` when the caller says the page is a gift (`giftRequired`, which the finder's wrap step sets); exactly 24 doors on `advent-classic`; 1 to 31 doors on `countdown`; a real `startDate`. The builder prompt's Gifts and Invitations sections name the same ids, and a test keeps them in step. If anything fails, or the JSON does not parse, or the answer was cut off, the builder asks once more with the problems listed. A second failure throws `BuilderInvalidOutput`.

Before saving, `sanitize()` drops every gift link and image that is not `https:`, renumbers calendar doors by position (door N is always the Nth door), and replaces an unknown timezone with the sender's. The letter's title is generic and made by `titleFor()`, for example "A gift for Tom" (also for the 3D gift box and the party pop box), "An invitation for Sophie" (also for the 3D wedding envelope) or "An advent calendar for Anna": never message text or a code.

### The research sub-agent

[`researchGifts()`](../../lib/agents/research.ts) runs its own short tool loop and returns only 3 to 5 ideas (title, reason, price, link) to the main agent, never the search results. It ends with one call to `report_gifts`, a strict tool. It has two modes, each with its own constant system prompt:

- **Tavily**, when `TAVILY_API_KEY` is set: a client tool `search_web` that [`tavily.ts`](../../lib/agents/tavily.ts) answers with one `POST https://api.tavily.com/search` (`search_depth: "basic"`, 5 results, one chunk per source, no answer, raw content or images, an 8-second timeout). Results are cut to a 120-character title and a 500-character extract before the model sees them. A failed search goes back to the model as an error result, and the query, which describes the recipient, is kept out of the logs.
- **Anthropic's web search** otherwise: the server tool `web_search_20260209` with `max_uses: 4`.

Both modes stop after 4 searches and 4 model requests. Before the last request the agent is nudged to report. Ideas are cleaned by `toGiftIdeas()`: at most 5, title cut to 120 characters, reason to 400, price to 40, and links kept only if they are `https:`.

### The NDJSON events

[`lib/agents/events.ts`](../../lib/agents/events.ts) is the contract between the route and the chat UI. The route answers `application/x-ndjson; charset=utf-8` with one JSON event per line ([`lib/agents/ndjson.ts`](../../lib/agents/ndjson.ts)); `JSON.stringify` escapes newlines inside strings, so each event is exactly one line. In the browser, [`components/create/ndjson.ts`](../../components/create/ndjson.ts) splits the stream into events and the pure reducer in [`chat-state.ts`](../../components/create/chat-state.ts) turns them into what the screen shows.

| Event | Sent when | What the chat does |
|---|---|---|
| `letter { letterId }` | First, for a new gift | Moves the address to `/create/<id>` |
| `text { delta }` | Text streams in | Appends to Majnu's message |
| `tool { name, status, label }` | A tool starts, finishes or fails | Shows or clears the status line |
| `templates { ids }` | `suggest_templates` ran | Shows template cards |
| `gifts { ideas }` | `research_gifts` found ideas | Shows gift cards |
| `preview { letterId, kind, templateId }` | Content was built or changed | Reloads the preview |
| `limit { reason, message }` | A limit or plan gate stopped something | Shows a notice; `reason` is `daily_letters`, `chat_turns`, `monthly_gifts` or `full_moon_only` |
| `refusal { message }` | The model declined | Shows a friendly "try another way" |
| `error { message }` | Something failed | Shows the message, written in the brand's voice by [`errors.ts`](../../lib/agents/errors.ts) |
| `done` | Always, last | Ends the turn |

Before the stream starts, failures are plain HTTP errors with a JSON body `{ error }`: 400 for a bad body, 401 without a session, 404 for a letter that is not yours, 500 when the letter cannot be loaded or created. When the daily limit is reached for a new gift, the answer is a short, already finished stream with a `limit` event, so the chat shows it like any other notice.

### Stored history

The conversation is stored in `letters.chat` **exactly as the API returned it**, thinking blocks included, and replayed unchanged and append-only on the next message. It is never rebuilt from our own objects. The one rule the API sets on echoing a reply concerns server-side fallbacks: when a model declined part-way and a fallback model continued, the blocks the declining model wrote before the last `fallback` block are left out. [`echoableContent()`](../../lib/agents/history.ts) applies this once, when the reply is first appended, so stored history is never edited later.

Per-request facts never go into a system prompt. Each sender message starts with a `<context>` text block from [`context.ts`](../../lib/agents/context.ts), for example `<context>Today is Saturday 2026-11-21 in Europe/Berlin (UTC+01:00). The sender's timezone is Europe/Berlin.</context>`. The default timezone is `Europe/Berlin` when the browser sends none or an unknown one.

When a gift is reopened, `/create/[id]` turns the stored conversation into display messages with [`toDisplayMessages()`](../../lib/agents/display.ts). It shows one assistant message per turn, recovers template cards from `suggest_templates` calls and gift cards from `research_gifts` results, and hides the context block, tool results and thinking. Only those display messages reach the browser; the stored conversation stays on the server.

### Model settings

All three agents share the request fields from [`agentRequestBase()`](../../lib/agents/client.ts):

| Setting | Value | Why |
|---|---|---|
| `model` | `MAJNU_MODEL`, default `claude-opus-5-5` | One switch for every agent; `claude-sonnet-5-5` is the documented fallback if replies feel slow or costs run high |
| `betas` | `thinking-binding-controls-2026-08-01`, `server-side-fallback-2026-07-01` | Needed for `block_binding` and `fallbacks` |
| `thinking` | `{ type: "adaptive", block_binding: { prefix_mismatch_behavior: "drop_block" } }` | A prompt or tool change during the night drops old thinking blocks instead of breaking conversations already in progress |
| `fallbacks` | `"default"` | A request the safety classifiers decline is re-run on the model Anthropic recommends for that category |
| `output_config.effort` | `"low"` | Replies must feel fast on a phone |
| Client | `maxRetries: 2`, created on first use, `ANTHROPIC_BASE_URL` honoured | Retries 408, 409, 429 and 5xx with backoff; an AI gateway can be put in front later with no code change |

Requests never send `temperature`, a thinking budget or a forced `tool_choice`: current models reject all three. The system prompts and tool lists are built once from static data, so they stay byte-stable and cacheable.

**Verified live** on `claude-opus-5-5` on 21 November, as recorded in [docs/plan.md](../plan.md#agents): `output_config.effort`; `block_binding: drop_block`, with a stored history replayed after a JSON round trip and no input transformations; `fallbacks: "default"` accepted (an actual fallback was not triggered); effort and format sharing one `output_config`; and `web_search_20260209` with `max_uses: 4`. The check is [`scripts/agent-smoke.test.ts`](../../scripts/agent-smoke.test.ts): `npx vitest run --config scripts/agent-smoke.config.mts`. Its header puts it at about 8 to 10 short, low-effort paid requests; it mocks the store and the limits, so nothing is written to the database. Re-run it after changing a prompt or the SDK.

## Pieces

| Piece | Job |
|---|---|
| [`app/api/chat/route.ts`](../../app/api/chat/route.ts) | `POST /api/chat`: session, body, letter, limits, the agent turn, saving, the event stream |
| [`lib/agents/main.ts`](../../lib/agents/main.ts) | The main agent's system prompt and tool loop |
| [`lib/agents/tools.ts`](../../lib/agents/tools.ts) | Tool definitions, plan gates and what each tool does |
| [`lib/agents/builder.ts`](../../lib/agents/builder.ts) | Builder sub-agent: structured output, checks, sanitising, generic titles |
| [`lib/agents/research.ts`](../../lib/agents/research.ts) | Research sub-agent and its two search modes |
| [`lib/agents/tavily.ts`](../../lib/agents/tavily.ts) | The Tavily Search API call |
| [`lib/agents/client.ts`](../../lib/agents/client.ts) | The one place that creates the Anthropic client and picks the model |
| [`lib/agents/context.ts`](../../lib/agents/context.ts) | The `<context>` block, timezones and today's date |
| [`lib/agents/history.ts`](../../lib/agents/history.ts) | The fallback echo rule for stored replies |
| [`lib/agents/display.ts`](../../lib/agents/display.ts) | Stored conversation to chat messages, for reopened gifts |
| [`lib/agents/events.ts`](../../lib/agents/events.ts), [`lib/agents/ndjson.ts`](../../lib/agents/ndjson.ts) | The event contract and the stream writer |
| [`lib/agents/errors.ts`](../../lib/agents/errors.ts) | Friendly messages for the sender, safe log lines for us |
| [`lib/agents/safe-url.ts`](../../lib/agents/safe-url.ts) | Drops every link that is not `https:` |
| [`components/create/`](../../components/create/) | The chat UI: `create-chat.tsx`, `use-letter-chat.ts`, `chat-state.ts`, `ndjson.ts`, the composer, the template picker and the preview pane |
| [`app/(app)/dashboard/page.tsx`](../../app/(app)/dashboard/page.tsx) | The Create tab: an empty chat with a fresh key on every visit |
| [`app/(app)/create/[id]/page.tsx`](../../app/(app)/create/[id]/page.tsx) | The same chat for an existing gift, with its display messages |
| [`app/(app)/create/actions.ts`](../../app/(app)/create/actions.ts) | Server action that gives the chat a new gift's slug and name |
| `letters.chat`, `letters.content` | The stored conversation (server-written) and the built content |
| `ANTHROPIC_API_KEY`, `MAJNU_MODEL`, `ANTHROPIC_BASE_URL`, `TAVILY_API_KEY` | The key, the model, an optional gateway and the optional search key |

## Data and privacy

- **The conversation** is stored in `letters.chat` for as long as the letter exists. The browser can read its own letters but cannot write `chat`: the column is left out of the update grant, because the turn limit counts it, and a browser that could rewrite it could reset the count or replay a huge forged history at our cost. `saveChat()` checks ownership through row-level security, then writes with the service-role client.
- **Thinking blocks and tool results** never reach the browser; reopened chats get display messages only.
- **What leaves the server:** the conversation goes to Anthropic to write the replies. With Tavily on, the research agent's search queries go to Tavily; both are named on the privacy page.
- **Logs** carry no message text, gift codes or keys. [`describeError()`](../../lib/agents/errors.ts) logs the error class, status, request id and the API's own error text, which describes the request shape, not its content. Tavily search failures log only the reason.
- **Links written by a model** are kept only if they are `https:` (builder, research, and again in the public view), so a `javascript:` or `data:` link can never become an `href` on a gift page.
- **Titles** are generic, so browser history and link previews show "A letter for Anna", never the message.

## Limits and costs

| Limit | Value | Where |
|---|---|---|
| New gifts per user per UTC day | 5 | `LIMITS.lettersPerDay` in [`lib/limits.ts`](../../lib/limits.ts), checked in the route and again in `createLetter()` |
| Sender messages per gift | 40 | `LIMITS.chatTurnsPerLetter`; tool results travel as user messages but are not counted |
| Characters per message | 4,000 | `MAX_MESSAGE_LENGTH` in the route |
| Model requests per sender message | 6, each up to 8,192 output tokens | `MAX_REQUESTS_PER_TURN` in `main.ts` |
| Builder calls per build or edit | 2 at most, each up to 16,000 output tokens | `buildContent()` |
| Research per run | 4 searches and 4 model requests, each up to 16,000 output tokens | `MAX_SEARCHES`, `MAX_REQUESTS` in `research.ts` |
| Tavily search | 5 results, basic depth, 8-second timeout | `tavily.ts` |
| Calendars | A real account; everything else is free for everyone (there are no plans since 21 November) | `canUseFeature()` in [`lib/limits.ts`](../../lib/limits.ts) |

On top of these, a monthly spend limit is set in the Anthropic Console. All counts go through the signed-in user's client, so row-level security limits them to that user's own letters.

**Cost of one message** is bounded by the table above but has not been measured. The main agent's prefix is cached (an ephemeral cache, about five minutes), which makes the second and later requests of a tool loop cheaper; the builder and research calls are not cached. On Cloudflare, time spent waiting on the model does not count against the Worker's CPU limit, but the code around it does, so the route keeps that work small.

## How it was checked

- **Unit tests** in [`tests/unit/lib/agents/`](../../tests/unit/lib/agents/): `chat-route.test.ts` (status codes, the new-letter flow, limits, saving), `main.test.ts` (the tool loop, refusals, cut-off calls, pause turns), `tools.test.ts` (gates and results), `builder.test.ts` (checks, retries, sanitising, titles), `research.test.ts` and `tavily.test.ts` (both search modes, caps, timeouts), `history.test.ts`, `display.test.ts` and `ndjson.test.ts`. The chat UI's stream reader and reducer are covered in [`tests/unit/components/create/`](../../tests/unit/components/create/), and the limits in [`tests/unit/lib/limits.test.ts`](../../tests/unit/lib/limits.test.ts).
- **Live:** the model settings above were checked against the real API with `scripts/agent-smoke.test.ts` on 21 November.
- **Not verified:** an actual server-side fallback (the parameter is accepted, but no request has been declined and re-run), and the cost of a typical conversation.

## Open questions

- Measure what a typical conversation costs (tokens per message, cache hit rate) before ads scale up, and decide whether `claude-sonnet-5-5` should be the default.
- The limits are per user. Once the gift finder brings anonymous accounts ([#33](https://github.com/peresramirez/majnu/issues/33)), one person can make many accounts; the site-wide caps planned for the finder are the backstop.
- Advent calendars in the agent and the owner preview are still tracked in [#13](https://github.com/peresramirez/majnu/issues/13), the create page in [#6](https://github.com/peresramirez/majnu/issues/6), and a preview that grows with every message in [#30](https://github.com/peresramirez/majnu/issues/30).
- Gift ideas from `research_gifts` carry no image. The gift finder's options will ([`lib/finder/events.ts`](../../lib/finder/events.ts)).
