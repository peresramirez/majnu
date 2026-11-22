# Majnu: build plan

Majnu is a personalized digital gifting platform. Its main flow (see "Gift finder") helps someone find the right gift for a person they love, without signing in, then wraps the chosen gift in a page made for that person, shared by link and QR code. Letters, invitations and advent calendars are made by chatting with the same agent. We track when the recipient opens a gift.

The product's building block is still called a letter in the code and in this plan: a gift is a letter that carries a gift code, and an invitation is a letter with an event.

It has to be live within about 8 hours of starting, so ads can run the same night. Two developers build it in parallel, each with their own coding agent, on `peresramirez/majnu`.

Starting point: the Next.js 15 + Supabase starter runs on Cloudflare Workers at https://majnu.app with Google sign-in set up. There is no database schema, no AI code and no payments yet. Keys and services are described in [setup.md](setup.md).

## Decisions

- **Letters are data, not generated code.** Templates are React pages in our app. The builder agent fills a JSON content object stored in Supabase, so a letter is live in seconds and its link never expires.
- **AI runs on the official Anthropic TypeScript SDK** with our own API key. The model id comes from `MAJNU_MODEL` (default `claude-opus-5-5`, low effort). Switch to `claude-sonnet-5-5` if replies feel slow or costs run high.
- **No Python agent framework or proxy** (decided 21 November). Pydantic AI and LiteLLM were considered for their ready-made chat UI and multi-provider fallback. Both are Python servers that cannot run on Workers, so they would add a second service with its own login check and deploy, and a fallback to another provider cannot continue a conversation stored in Anthropic's format. Resilience instead: retry on overload, Anthropic's server-side model fallback, and one place that creates the client (`lib/agents/client.ts`), so an AI gateway can be put in front later through `ANTHROPIC_BASE_URL`.
- **The signed-in app has four tabs** (since 22 November, issue #47): **Find a gift**, **My gifts**, **Create** and **Tracker**, as a bottom bar on phones and top tabs on desktop. The app opens on Find a gift, the gift finder inline. Create is a hub for the optional extras (letters, invitations, advent calendars and the Templates gallery); Purchases, which replaced the Plan tab, is in the account menu. Details in [features/app-shell.md](features/app-shell.md). The letters chat opens empty at `/dashboard`. Its message box has a **Template** button that opens the template cards; choosing one attaches it, and the message is sent as ordinary text (`Use the "Classic envelope" template.`), so the main agent always sees the choice in the conversation.
- **Business model (changed 21 November): free product, one paid extra.** Finding, personalising, default templates, letters, invitations, calendars (with an account), sharing and tracking are free. The only paid thing is a **personalised wrapper**: a one-off design for one gift, made by the designer agent in a Daytona sandbox, **€2.99 once** (Stripe Checkout in payment mode). No subscription. Affiliate links on recommended shops come later. See [business-plan.md](business-plan.md) and issue #39. Built 22 November ([features/billing.md](features/billing.md)): the Full moon subscription, its gates and `MAJNU_BILLING` are removed.
- **Daytona is an optional extra**, built only if everything else is done. Its sandboxes stop 15 minutes after the last SDK call, so anything built there is copied to our storage and served from our domain.

## Gift finder: the main flow (decided 21 November)

The product now leads with one job: **help someone find the right gift for a person they love.** Letters, invitations and calendars stay, but behind it, as optional extras. After joining or signing in, the app opens on the finder (issue #47, built 22 November): sign-up, sign-in (Google, email and password, email links) and a guest's upgrade land on `/dashboard/find` unless a same-site `next` says otherwise, and that tab hosts the same finder as the landing page (conversation, gift ideas, personalising, wrapping, voice input) inline in the app, with "Who is the gift for?" as its empty state. Letters, invitations, calendars and templates are one tap away under Create. Letters and invitations are free; advent calendars are free with an account, and the sender fills one by picking a gift for each door from a pool of ideas Majnu finds for that person (issue #48).

### The flow

1. **Landing page.** The Majnu and Layla scene stays. The hero gets a chat box, as on layla.ai: Majnu's greeting ("Who are you looking for a gift for?"), a message box whose placeholder types out examples in turn ("Find a gift for my mother", "…for my girlfriend", "…for my best friend"), a primary button and a few suggestion chips. No sign-in.
2. **Context without questions.** Sending opens the finder as a modal (a full-height sheet on phones). The server reads the visitor's **country and region from the network** (Cloudflare's request data; no browser permission prompt, no exact location) and the browser sends its **language** and timezone. Majnu infers the **relationship** and an **age range** from what was typed (girlfriend: about 20–35; mother: about 45–70; until the visitor says otherwise), and shows these assumptions as chips the visitor can correct.
3. **Research.** The research sub-agent searches with Tavily in the visitor's language and country, and returns **three options**: image, title, short description, price in the local currency, shop and link, with **one recommended** and why.
4. **Personalise the gift.** If none fits, Majnu asks a few questions (name, exact age, what they love, their job, a public social profile if the visitor wants to share one) and searches again. A public Instagram or TikTok profile is read with Apify, only when the sender pastes it, and only a short summary of interests is kept (never posts or images); other public pages are read with Tavily.
5. **Wrap it.** Choosing an option shows the templates that fit a gift (gift reveal, 3D gift box, party pop box, classic envelope, postcard; the two boxes since issue #50). Majnu writes the page around the chosen gift, shows it, and gives the link and QR code. "Make it unique" (the Daytona redesign) is offered on the preview.
6. **Advent calendars** ask the visitor to create a free account. Majnu then finds a pool of small gift ideas for the person (one research run), and the sender fills the 24 doors by picking a gift for each one, adding their own, or leaving a note; sharing opens once every door has something (issue #48).

### Accounts and limits

- **Invisible anonymous accounts.** The first finder message signs the visitor in anonymously with Supabase (`signInAnonymously`), protected by an invisible Cloudflare Turnstile check that Supabase verifies. Everything that works for signed-in users (ownership, row-level security, limits, My gifts, sharing) works for them. Signing up later links an email or Google identity to the same account, so nothing is lost. Middleware treats anonymous users as signed out for `/signin` and `/signup`, so they can upgrade.
- **Finding is open; personalising needs a free account** (developer's call, 21 November). Guests (the invisible anonymous accounts) get 3 plain searches a day; asking to personalise shows Sign up / Log in and returns to the same finder session. Signed-in users get 3 searches a day, 2 of them personalised. A site-wide daily cap on searches (`MAJNU_DAILY_SEARCH_CAP`) protects the budget against ad traffic. Apify profile reads have their own small site-wide cap (`APIFY_DAILY_CAP`), because the Apify credit is $5.
- **Privacy.** The country and region are stored with a finder session to explain its results; never an address or exact location. The privacy page must name Turnstile, Apify and anonymous accounts before this goes live.

### Contract and work split

`lib/finder/events.ts` defines the request, the streamed events and the wrap call. Issues: #31 finder agent and API, #32 landing page finder, #33 anonymous visitors, app tabs and privacy, #34 social profile reading.

## Gift list on invitations (decided 21 November)

Wedding and birthday invitations can carry a **gift list**: `wedding-invite`, `party-invite`, `wedding-envelope-3d` and a `party-box` that carries the party's date and place (the last two since issue #52). `GIFT_LIST_TEMPLATES` in `lib/claims/rules.ts` is the one list the agent's tool, the claim route, My gifts and the main agent's prompt go by. In the Letters & invitations chat, the host asks Majnu to research gifts they would like, picks some, and they are added to the invitation (an optional, additive `wishlist` on `LetterContent`, each item with a stable id). On the invitation page, guests see the list at the end and tap "I'll bring this" to claim an item, optionally leaving a first name for the host. A claimed item shows as taken for everyone else and cannot be claimed twice (a unique claim per letter and item). Claims need no account and store nothing on the guest's device; they go through a server route that limits claims per visitor hash. The host sees who claimed what in My gifts and can release a claim. Issue #35.

## Voice (decided 21 November)

- **Voice input** (#37): a microphone button in the finder and the letters chat records up to 60 seconds; `POST /api/transcribe` sends it to OpenAI's transcription endpoint and returns text for the user to check and send. This is the one exception to "Anthropic SDK only": OpenAI is used for speech to text and nothing else, called with `fetch` (no OpenAI SDK), key `OPENAI_API_KEY`. Recordings are not stored. A daily per-user cap keeps the cost bounded.
- **Audio note in a gift** (#38): the sender records up to 2 minutes; it is stored in a private Supabase Storage bucket with the letter and served from our own domain at `/l/<slug>/audio`, so gift pages still load nothing from other sites. Every template shows a "Tap to hear" button when a note exists.

## Architecture

### Routes

| Route | Access | Purpose |
|---|---|---|
| `/` | public | Landing page with live template examples and Google sign-in |
| `/dashboard/find` | signed in | **Find a gift** tab, the app's first screen and where sign-in lands: the gift finder inline, its state kept in the app shell so a conversation survives the other tabs |
| `/dashboard/create` | signed in | **Create** tab: letters, invitations (wedding, party), advent calendars (guests are asked to create an account) and the Templates gallery |
| `/dashboard` | signed in | The letters chat, reached from Create: an empty chat. The first message creates the letter and the URL moves to `/create/<id>` without interrupting the reply. `?template=<id>` attaches a template. It stays at this address so every existing link to it keeps working |
| `/dashboard/templates` | signed in | The Templates gallery, under Create: every template with a preview and "Use this template" |
| `/create/[id]` | owner | The same chat for an existing gift, with the live preview and share panel (link, copy, QR, WhatsApp): beside the chat on desktop, behind a Preview button on phones |
| `/dashboard/gifts` | signed in | **My gifts** tab: every gift with first and last opened, total opens and unique visitors |
| `/dashboard/tracker` | signed in | **Tracker** tab: who opened each gift, where, when and in which language (issue #49) |
| `/dashboard/purchases` | signed in | **Purchases**, in the account menu: the personalised wrappers bought, their status and receipts. `/dashboard/plan` redirects here |
| `/create/[id]/preview` | owner | The letter as the recipient will see it, all calendar doors open, no tracking. In the `(owner)` route group so it renders full-bleed without the app shell |
| `/l/[slug]` | public | The letter or calendar, full-bleed, no site chrome |
| `/dev/templates` | public | Every template rendered from fixture data. Dev B's workbench and the source for ad screenshots |
| `/impressum`, `/privacy`, `/terms` | public | Required before ads run in Germany. Built in `app/(marketing)/`; the operator's name and address come from `lib/legal.ts` |
| `/signin`, `/signup` | public | Night palette beside the Majnu and Layla scene, in their own `app/(auth)/` layout |
| `POST /api/chat` | owner | Main agent, streamed |
| `POST /api/open` | public | Records `open`, `door_open`, `gift_click` |
| `POST /api/checkout`, `GET /billing/return`, `POST /api/stripe/webhook`, `GET /api/purchases`, `GET /api/purchases/[id]` | owner, owner, Stripe, owner, owner | Open Checkout for a personalised wrapper, confirm it on return, mark it paid and start the design from Stripe's events, and show a letter's or a purchase's status |

Short link: `majnu.app/l/<slug>`, where the slug is 10 random characters from `crypto.randomBytes`.

`/l/[slug]` is `noindex`, sends no referrer, is always rendered on request, and loads no third-party scripts. Its link-preview text stays generic ("A letter for Anna"), never the message or a gift code.

### Data

One migration: `supabase/migrations/0001_init.sql`.

- `letters`: `id`, `owner_id` → `auth.users`, `slug` unique, `kind` (`letter` | `calendar`), `template_id`, `title`, `content` jsonb, `chat` jsonb, timestamps.
- `profiles`: `user_id` → `auth.users`, `plan` (`free` | `full-moon`), `stripe_customer_id`, `stripe_subscription_id`, `plan_renews_at`. One row per user. The billing columns are left from the retired subscription and unused.
- `purchases` (`0007_purchases.sql`): one personalised wrapper for one letter, with the request, the consent, the Stripe ids and the status from `pending` to `done` or `refunded`. Owners read their own; only server code writes.
- `letter_events`: `letter_id`, `type`, `day int not null default 0`, `visitor_id`, `user_agent`, `country`, `city`, `language`, `device`, `created_at`, with a unique index on `(letter_id, type, day, visitor_id)` so repeat visits do not inflate counts. Owners read every column except `visitor_id` and `user_agent` (the Tracker tab, issue #49).

Security rules:

- Turn row-level security on explicitly for both tables. Tables created by SQL have it off by default.
- Owners can read their own letters and update only the content columns (`kind`, `template_id`, `title`, `content`). `slug`, `owner_id`, `chat` and everything in `profiles` are written only by server code; users can read their own profile. `chat` is server-only because the turn limit counts it: a browser that could rewrite it could reset the count or replay a huge forged history at our cost. `saveChat` checks ownership through RLS, then writes with the service-role client.
- The dashboard's list reads the `letter_summaries` view (`security_invoker`), so open statistics are computed in the database under the caller's own row-level security.
- There is no anonymous read policy. The public page, `/api/open` and the link-preview image use a server-only service-role client (`lib/supabase/admin.ts`) and look up by exact slug. Content holds gift codes, and locked calendar doors must never reach the browser early.
- Agent tools write letter content with the signed-in user's client, so the database enforces ownership.

Calendar unlocks: door N opens on `startDate + (N-1)` days. Compare calendar dates in the calendar's timezone (`Intl.DateTimeFormat("en-CA", { timeZone })`), not timestamps. The server removes the content of locked doors before rendering. In the owner's preview every door is open; otherwise a calendar starting 1 December shows nothing but locked doors while it is being made.

Open tracking: a small client beacon fires on page load, so link-preview crawlers (WhatsApp, iMessage) do not count. The server resolves the slug and ignores events for locked doors. The dashboard shows first opened, last opened, total opens and unique visitors.

`visitor_id` is computed on the server in `/api/open`: an HMAC-SHA-256 of the letter id, the visitor's IP address and user agent, keyed with a server secret (`OPEN_HASH_SECRET`). Each visitor is recorded once per event type and door, so `totalOpens` counts visitors who opened and `lastOpenedAt` is the latest event of any kind. Known gap: a sender opening their own `/l/<slug>` counts as an open; only the owner preview is excluded. Nothing is stored on the recipient's device and the IP address itself is never saved. This is what lets the site run without a cookie banner (§ 25 TDDDG), and it is what `/privacy` promises; if open tracking changes, change the privacy page in the same commit.

Spending guard, because visitors from ads spend our API key: at most 5 letters per user per day and 40 chat turns per letter, plus a monthly spend limit set in the Anthropic Console.

### The contract between the two developers

These files are written together during setup. After that, changes are additive only and need both people.

- `lib/letters/schema.ts`: zod schemas and types. Import zod as `import * as z from "zod/v4"`, because the Anthropic SDK's zod helpers require it.
  - `LetterContent`: `recipientName`, `senderName`, `occasion`, `headline`, `body[]`, `signOff`, `theme { palette, font }`, `gifts[] { title, description?, url?, code?, imageUrl?, price? }`, `event? { title, startsAt, locationName, address }`.
  - `CalendarContent`: `recipientName`, `senderName`, `headline`, `intro`, `startDate`, `timezone`, `theme`, `doors[] { day, title, message, gift? }`.
  - `PublicLetter`: what a template receives. Doors are either `{ day, locked: true }` or `{ day, locked: false, ... }`.
- `lib/letters/templates.ts`: template metadata only (`id`, `kind`, `name`, `description`, `bestFor`). It imports no components, so a broken template cannot take down the chat route.
- `lib/letters/fixtures.ts`: one realistic example per template.
- `lib/letters/store.ts`: `getPublicLetter(slug)` and `toPublicView(letter, now, { ownerPreview })`. `getPublicLetter` always resolves the demo slugs `demo-letter`, `demo-gift` and `demo-calendar` to fixtures, so templates can be built and shown without the database.
- `lib/agents/events.ts`: the newline-delimited JSON events `POST /api/chat` streams to the chat UI, and the request body. The `draft` event (live drafts, issue #30) was added after setup.

Template ids, fixed now: letters `classic-envelope`, `wedding-invite`, `party-invite`, `gift-reveal`, `postcard`; calendars `advent-classic` (24 doors) and `countdown` (any number of days, any occasion).

### Agents

All agent code runs on the server in `lib/agents/`.

- **Main agent** (`main.ts`): leads the conversation in steps, and the preview grows with it (issue #30, decided 22 November): who the letter is for and the occasion → a **first draft in that same turn**, with the template that fits best, and template cards to switch → message and details, with an `edit_letter` in the same turn for every message that adds a fact (a name, a memory, a gift, a date, a place) → share → offer a calendar. The first draft may come before the names; the builder then writes the recipient as the sender calls them ("Sister") and leaves the sender's name empty until they give it. The template list from `templates.ts` goes into its system prompt, with top-level prompt caching. Its tool loop is written by hand on `client.beta.messages.stream()` in `POST /api/chat`, not on `toolRunner`: in SDK 1.12.0 the runner keeps server-side threads and appends every reply itself, while the route must decide what is stored (refused replies are left out; a tool call cut off at `max_tokens` gets an error result so the history stays valid). It streams the newline-delimited events defined in `lib/agents/events.ts`; `components/create/use-letter-chat.ts` turns them into chat state. Replies are plain text with paragraphs and **bold** only, because the chat renders nothing else.
- **Tools the main agent can call:**
  - `suggest_templates`: the chat shows clickable template cards; a click sends an ordinary message.
  - `research_gifts`: runs the research sub-agent.
  - `build_letter`: runs the builder sub-agent; while it writes, the create page shows the draft (below); then it saves the result and the preview reloads.
  - `edit_letter`: the builder again, given the current content and the requested change; its draft is shown over the current content.
  - At most 2 builder runs per sender message (`MAX_BUILDS_PER_TURN` in `tools.ts`), to bound what an edit after every message spends.
- **Research sub-agent** (`research.ts`): its own tool loop with Anthropic's web search (`web_search_20260209`, at most 4 searches) and a `report_gifts` tool it calls once at the end with 3–5 ideas (title, reason, price, link). When `TAVILY_API_KEY` is set, the search runs on Tavily instead, through a client tool `search_web` (`lib/agents/tavily.ts`: 5 trimmed results per search, an 8-second timeout, a failed search returned to the model as an error) with the same caps, and Anthropic's web search remains the fallback when the key is empty.
- **Builder sub-agent** (`builder.ts`): one streamed `client.beta.messages.stream` call with `betaZodOutputFormat` of the content schema in `output_config.format` (the beta namespace, because `fallbacks` and `block_binding` exist only there). The SDK parses and validates the final message as `parse()` did; the result is then checked against the template, and retried once, exactly as before. Today's date and the sender's timezone (Europe/Berlin when the browser sends none) go in the user message.
- **Live drafts** (`draft.ts`, issue #30): while the builder streams, its unfinished JSON is parsed tolerantly, cut down to what the draft view shows (no gift codes, links, images or gift list), merged over the current content when editing, and sent as a `draft` event at most four times a second. The create page shows it in a draft sheet in the preview's frame (`components/create/draft-sheet.tsx`) until the saved page has reloaded. Drafts are never stored and never reach a template or `/l/<slug>`.

Rules the current models impose:

- Store the conversation exactly as the API returned it, including thinking blocks, in `letters.chat`, and replay it unchanged and append-only. Never rebuild history from our own objects.
- Keep the system prompt and tool list byte-stable: no dates or per-user text in `system`. Set `thinking.block_binding.prefix_mismatch_behavior` to `drop_block` (beta `thinking-binding-controls-2026-08-01`), so a prompt fix during the night cannot break chats already in progress.
- Set effort with `output_config: { effort: "low" }`. Do not send `temperature`, a thinking budget, or a forced `tool_choice`; all three are rejected.
- Check `stop_reason` for `"refusal"` and show a friendly "try again". Turn on `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`).
- The chat route streams for as long as the model takes. On Cloudflare, time spent waiting on the model does not count against the CPU limit, but the work around it does: see the plan limits in [setup.md](setup.md).

Verified live on `claude-opus-5-5` (21 November): `output_config.effort`, `block_binding: drop_block` (stored history replayed after a JSON round trip with no input transformations), `fallbacks: "default"` (accepted; an actual fallback was not triggered), effort and format sharing one `output_config`, and `web_search_20260209` with `max_uses: 4`. Re-run the manual check after changing a prompt or the SDK: `npx vitest run --config scripts/agent-smoke.config.mts` (about 20 short paid requests).

Limits in the chat route on top of the spending guard: messages over 4,000 characters are refused, one message triggers at most 6 main-agent requests and at most 2 builder runs (each up to 2 requests), and research stops after 4 searches and 4 requests.

Not tonight: Claude Managed Agents, where Anthropic hosts the agent loop and a sandbox. It is in beta and adds session start-up to a chat that has to feel instant.

### Billing (Stripe)

Changed 22 November (issue #39): the only paid thing is the **personalised wrapper**, €2.99 once, VAT included. Everything is in [features/billing.md](features/billing.md); in short:

- Built from the Stripe skills in this repo (API version `2026-11-18.endive`, SDK 23.2.0). All of it is in `lib/billing/` (server only), the routes above and `components/wrapper/`. Prices and wording come from `lib/plans.ts`; `lib/limits.ts` keeps the spending guard and "calendars need a real account", and gates nothing on a payment.
- "Make it unique, €2.99" sits under the share panel on the finder's wrapped gift and on the letter preview. It opens a dialog: a guest is asked to create a free account first (same-site `next` back to `/create/<id>`); a member writes a short design request and ticks a required box agreeing that the design starts at once and that this ends the right of withdrawal (§ 356 (5) BGB). The server stores its own copy of that sentence and the time with the purchase.
- `POST /api/checkout` refuses without `consent === true`, for guests, other people's letters, calendars, unbuilt letters and letters with a design on its way; records a pending purchase; and opens Checkout in **payment** mode with the purchase id as metadata. The account has Stripe Managed Payments on by default; sessions switch it off so Majnu stays the seller.
- The webhook (`checkout.session.completed` and `.async_payment_succeeded`, signature-checked) and the return page both move the purchase from pending to paid with a conditional update and send it to the `majnu-designs` Cloudflare Queue. The job claims it once (`paid → designing`), and either marks it done with the design or refunds the payment through the Stripe API (idempotency key per purchase).
- To go live: create the live product and one-time €2.99 price and put its id in `STRIPE_PRICE_WRAPPER`; subscribe the webhook endpoint `https://majnu.app/api/stripe/webhook` to `checkout.session.completed`, `.async_payment_succeeded`, `.async_payment_failed` and `.expired`; give a restricted key write access to Checkout Sessions and Refunds and read access to Payment Intents and Charges; deploy (which creates the queues). Not handled yet: disputes and fraud warnings, and VAT outside Germany.

### Daytona redesign: the personalised wrapper's designer

A sender can ask for a one-off look ("designed for you"). Claude Code, running in a Daytona sandbox, writes one self-contained HTML page from the letter's content. We store the page with the letter and delete the sandbox, so the result never depends on the sandbox existing. Letters only: a calendar baked into one static page would carry its locked doors.

- **Snapshot** (`majnu-letters-v1`, built by `scripts/daytona/build-snapshot.mts` in the `eu` region): Node 22, Claude Code pinned to the `stable` release, and the project it works in, `daytona/sandbox/`. That project holds the `majnu-letter` skill (the page rules), `CLAUDE.md`, permissions that allow only file tools, the template sources and schema as reference, and one rendered example per template (`scripts/daytona/export-references.mts`). Snapshots are immutable: after changing templates, the skill or the CLI version, build `majnu-letters-v2` and set `DAYTONA_SNAPSHOT`. The alternative was a plain sandbox with the templates pushed in from Supabase at every start. A snapshot starts faster, pins the CLI, and takes the same upkeep (one script run when the templates change).
- **The job** (`lib/daytona/redesign.ts`) starts an ephemeral sandbox that destroys itself after 20 minutes whatever happens. Its network is limited: to `api.anthropic.com` on Daytona Tier 3 and 4, and on our current tier, which refuses a per-sandbox list, to Daytona's essential services (package registries, git hosts, model providers). It uploads `content.json`, the request and the prompt as files, so no user text is ever part of a command. It runs `claude --print` with only the file tools (`--tools`, plus `--restricted`, which confines them to the project folder), a $3 budget (`--max-budget-usd`; this CLI version has no turn limit) and a 6-minute `timeout`, passing `ANTHROPIC_API_KEY` and `MAJNU_MODEL` in that one command's environment only. It downloads `out/index.html` and deletes the sandbox, also on errors. Only then does it check the page (`lib/daytona/validate.ts`: size, no network references, no forms or storage, links only to the letter's gift URLs, gift codes only inside the script, no keys) and insert it into `letter_designs` (migration `0003`). `DAYTONA_ANTHROPIC_API_KEY`, a key of its own with a low spend limit, is used when set, because the sandbox runs the model on text a stranger wrote.
- **Serving:** `GET /l/[slug]/design` returns the newest design with `Content-Security-Policy: sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox; default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'`, plus `nosniff`, `no-referrer`, `noindex` and `no-store`. The header is the security boundary, because this is user-influenced HTML on our domain. The page gets an opaque origin and the browser makes no requests for it; `allow-popups` exists only so gift links (`target="_blank"`) open the shop in a normal tab. `/l/[slug]` shows the design in an iframe when `getLatestDesignInfo(slug)` finds one.
- **Running it:** the first end-to-end run (21 November, a birthday letter, "a 1950s cinema ticket by the sea") took 81 s in all: under 2 s to start the sandbox, 9 Claude Code turns costing $0.26, and a 15 KB page. That is too long for a Worker request, so since 22 November a paid purchase runs it in a **Cloudflare Queue consumer in the same Worker** (`worker.ts` wraps OpenNext's fetch handler and adds `queue`, so `npm run deploy` still deploys one Worker): `majnu-designs` with `max_retries: 0` (a retry is another paid run) and the dead-letter queue `majnu-designs-dlq`, whose consumer refunds. `@daytona/sdk` does not bundle for Workers, so the job reaches Daytona with `fetch` (`lib/daytona/rest.ts`). The `purchases` table is the jobs table the sender's status card polls. By hand: `node scripts/daytona/run-purchase.mts <purchaseId>` for a paid purchase, or `node scripts/daytona/redesign.mts <letterId> "<request>"`. Details in [features/daytona-redesign.md](features/daytona-redesign.md).

### Brand

The brand is **Night Post**: plum night, petal white, a rose-gold crescent, Gilda Display headlines and Hanken Grotesk for everything else. The wordmark is MAJNU in wide capitals with the crescent above the J. Everything (logo files, colours, type, motion, voice) is in [brand.md](brand.md); assets are in `public/brand/`.

The landing page is built on it: a painted scene of Majnu giving Layla the moon (generated with FLUX, in `public/landing/`), with our own moon drawn on top that travels from his hands to hers as visitors scroll through how it works (`components/landing/gift-scene.tsx`). Brand colours are Tailwind's `night` and `day` palettes; fonts are in `app/fonts.ts`. Letter and calendar templates may use their own palettes; the site chrome around them follows the brand.

## Who builds what

After the shared setup, neither developer edits the other's files.

| | Dev A: agent, data, money | Dev B: templates, public pages, brand |
|---|---|---|
| Owns | `supabase/`, `lib/supabase/*`, `middleware.ts`, `lib/letters/store.ts`, `lib/letters/public-view.ts`, `lib/limits.ts`, `lib/open/*`, `lib/agents/*`, `lib/billing/*`, `app/api/*`, `app/(app)/**`, `app/(owner)/**`, `components/create/*`, `components/app/*` | `app/layout.tsx` and route-group layouts, `app/(marketing)/**`, `app/(public)/**`, `components/letters/**`, `components/calendars/**`, `components/share/**`, `public/**`, branding |
| Builds | Migration and security rules, admin client, middleware fix, agents and tools, chat UI, dashboard with stats, open tracking, limits, Stripe | 5 letter templates, 2 calendar templates with locked-door UI, renderer and the id-to-component map (`components/letters/registry.tsx`), map embed, gift reveal, share panel with QR, open beacon, landing page, legal pages, link-preview image, rebrand |
| Hands over | `getPublicLetter()`, `toPublicView()`, `/api/open` | `<LetterRenderer letter />`, `<SharePanel url locked onUnlock />`, `<TemplateCard id />` |

## Shared setup (first 30 minutes, together)

1. Dev A: write and apply the migration; add `lib/supabase/admin.ts` with `import "server-only"`; rewrite `lib/supabase/middleware.ts` to the official `@supabase/ssr` cookie pattern (the template's version drops refreshed sessions, which would log senders out mid-chat), remove its `console.log`, protect `/create`, and exclude `l/` and `api/open` from the matcher.
2. Dev B: add the `(public)` route group for `/l/[slug]`. Already done: the legal pages and the `(auth)` group for sign-in; the root layout is reduced to providers and metadata, the landing page lives in `app/(marketing)/`, and the signed-in pages live in `app/(app)/` with their own container and footer.
3. Together: write `schema.ts`, `templates.ts`, `fixtures.ts` and the stubbed `getPublicLetter()`. Commit to `main`.
4. Then work on branches `dev-a` and `dev-b`, merging to `main` at every checkpoint and whenever a handover interface lands. Deploy with `npm run deploy`, which publishes the last commit on the current branch.

## Schedule

T is the moment coding starts.

| Time | Dev A | Dev B | Checkpoint at the end |
|---|---|---|---|
| T to T+0:30 | Shared setup | Shared setup | Contract committed |
| T+0:30 to T+2:00 | Agent smoke test, chat route and hook, `suggest_templates`, `build_letter` | Landing page, renderer, `classic-envelope`, `gift-reveal`, `/l/[slug]` on fixtures | **1:** a letter made in chat renders on production. Submit ads for review |
| T+2:00 to T+4:00 | `/api/open`, dashboard stats, `edit_letter`, `research_gifts`, limits | `party-invite`, `wedding-invite` with map, `advent-classic` with locks, share panel with QR, legal pages | **2:** phone-to-phone loop works. Stripe live, or switch to the tip link |
| T+4:00 to T+6:00 | Calendar building, owner preview, Stripe, error states | `countdown`, `postcard`, link-preview image, mobile pass, rebrand | Feature freeze |
| T+6:00 to T+8:00 | Run-through on real phones, fixes | Same | Final deploy, ads on |

Cut list, first to go first: Daytona redesign, link-preview image, `postcard`, `countdown`, `research_gifts` (the main agent suggests gifts from its own knowledge), Stripe gating (use the tip link), map embed, `edit_letter`.

Never cut: the middleware fix, row-level security, the spend limit, the legal pages.

## Verification

- `npm run test:smoke` passes: every key reaches its service.
- `npm run typecheck` and `npm test` pass. Production builds ignore type errors, so the type check is the only thing that catches them.
- `npm run build` passes; `npm run dev`, then sign in → new letter → chat → build → the preview shows the chosen template.
- Open `/l/<slug>` in a private window: the letter renders, one `open` event appears and the dashboard counts it. The owner's own preview does not count.
- Calendar with `startDate` = today: door 1 opens, door 2 is locked, and door 2's text is absent from `curl -s .../l/<slug>`.
- With only the public anon key, `select` on `letters` returns no rows, and a user cannot change their own `profiles.plan` from the browser console.
- Personalised wrapper: a guest is asked to create an account; a member cannot pay without ticking the consent box; pay with a Stripe test card, return, and the Purchases tab shows the design being made, then the gift page shows it; a failed run is refunded automatically. Repeat once with a real card after going live.
- Phone-width pass on every template and the create page, then on two real phones.
- After the final deploy, repeat sign-in → letter → open on https://majnu.app.
