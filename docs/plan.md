# Majnu: build plan

Majnu is a personalized digital gifting platform. Someone signs in, chats with an AI agent, and gets a gift, letter, invitation or advent calendar as a web page made for one person, with a short link and QR code. We track when the recipient opens it.

The product's building block is still called a letter in the code and in this plan: a gift is a letter that carries a gift code, and an invitation is a letter with an event.

It has to be live within about 8 hours of starting, so ads can run the same night. Two developers build it in parallel, each with their own coding agent, on `peresramirez/majnu`.

Starting point: the Next.js 15 + Supabase starter runs on Cloudflare Workers at https://majnu.app with Google sign-in set up. There is no database schema, no AI code and no payments yet. Keys and services are described in [setup.md](setup.md).

## Decisions

- **Letters are data, not generated code.** Templates are React pages in our app. The builder agent fills a JSON content object stored in Supabase, so a letter is live in seconds and its link never expires.
- **AI runs on the official Anthropic TypeScript SDK** with our own API key. The model id comes from `MAJNU_MODEL` (default `claude-opus-5-5`, low effort). Switch to `claude-sonnet-5-5` if replies feel slow or costs run high.
- **No Python agent framework or proxy** (decided 21 November). Pydantic AI and LiteLLM were considered for their ready-made chat UI and multi-provider fallback. Both are Python servers that cannot run on Workers, so they would add a second service with its own login check and deploy, and a fallback to another provider cannot continue a conversation stored in Anthropic's format. Resilience instead: retry on overload, Anthropic's server-side model fallback, and one place that creates the client (`lib/agents/client.ts`), so an AI gateway can be put in front later through `ANTHROPIC_BASE_URL`.
- **The signed-in app has three tabs**: Create, My gifts and Plan, as a bottom bar on phones and top tabs on desktop. Create opens on a chat. The message box has a **Template** button that opens the template cards; choosing one attaches it, and the message is sent as ordinary text (`Use the "Classic envelope" template.`), so the main agent always sees the choice in the conversation.
- **Pricing is two plans**, defined once in `lib/plans.ts` and shown on the landing page: **Crescent**, free, 3 gifts a month (letters, invitations, gift pages); **Full moon**, €4.99 a month, unlimited gifts plus advent calendars and gift research. Billing is a Stripe subscription. Until Stripe takes live payments, `MAJNU_BILLING` stays unset: Full moon features are on for everyone, the Plan tab says so, and only the spending guard applies. Set `MAJNU_BILLING=on` to enforce plans.
- **Daytona is an optional extra**, built only if everything else is done. Its sandboxes stop 15 minutes after the last SDK call, so anything built there is copied to our storage and served from our domain.

## Architecture

### Routes

| Route | Access | Purpose |
|---|---|---|
| `/` | public | Landing page with live template examples and Google sign-in |
| `/dashboard` | signed in | **Create** tab, the first screen: an empty chat. The first message creates the letter and the URL moves to `/create/<id>` without interrupting the reply |
| `/create/[id]` | owner | The same chat for an existing gift, with the live preview and share panel (link, copy, QR, WhatsApp): beside the chat on desktop, behind a Preview button on phones |
| `/dashboard/gifts` | signed in | **My gifts** tab: every gift with first and last opened, total opens and unique visitors |
| `/dashboard/plan` | signed in | **Plan** tab: Crescent or Full moon, upgrade and cancel |
| `/create/[id]/preview` | owner | The letter as the recipient will see it, all calendar doors open, no tracking. In the `(owner)` route group so it renders full-bleed without the app shell |
| `/l/[slug]` | public | The letter or calendar, full-bleed, no site chrome |
| `/dev/templates` | public | Every template rendered from fixture data. Dev B's workbench and the source for ad screenshots |
| `/impressum`, `/privacy`, `/terms` | public | Required before ads run in Germany. Built in `app/(marketing)/`; the operator's name and address come from `lib/legal.ts` |
| `/signin`, `/signup` | public | Night palette beside the Majnu and Layla scene, in their own `app/(auth)/` layout |
| `POST /api/chat` | owner | Main agent, streamed |
| `POST /api/open` | public | Records `open`, `door_open`, `gift_click` |
| `POST /api/checkout`, `GET /billing/return`, `POST /api/stripe/webhook` | owner, owner, Stripe | Start the Full moon subscription, confirm it on return, and keep its status current |

Short link: `majnu.app/l/<slug>`, where the slug is 10 random characters from `crypto.randomBytes`.

`/l/[slug]` is `noindex`, sends no referrer, is always rendered on request, and loads no third-party scripts. Its link-preview text stays generic ("A letter for Anna"), never the message or a gift code.

### Data

One migration: `supabase/migrations/0001_init.sql`.

- `letters`: `id`, `owner_id` → `auth.users`, `slug` unique, `kind` (`letter` | `calendar`), `template_id`, `title`, `content` jsonb, `chat` jsonb, timestamps.
- `profiles`: `user_id` → `auth.users`, `plan` (`free` | `full-moon`), `stripe_customer_id`, `stripe_subscription_id`, `plan_renews_at`. One row per user.
- `letter_events`: `letter_id`, `type`, `day int not null default 0`, `visitor_id`, `user_agent`, `created_at`, with a unique index on `(letter_id, type, day, visitor_id)` so repeat visits do not inflate counts.

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
- `lib/agents/events.ts`: the newline-delimited JSON events `POST /api/chat` streams to the chat UI, and the request body.

Template ids, fixed now: letters `classic-envelope`, `wedding-invite`, `party-invite`, `gift-reveal`, `postcard`; calendars `advent-classic` (24 doors) and `countdown` (any number of days, any occasion).

### Agents

All agent code runs on the server in `lib/agents/`.

- **Main agent** (`main.ts`): leads the conversation in steps: who the letter is for and the occasion → template → message and details (date and place for invitations, gifts) → build → share → offer a calendar. The template list from `templates.ts` goes into its system prompt, with top-level prompt caching. Its tool loop is written by hand on `client.beta.messages.stream()` in `POST /api/chat`, not on `toolRunner`: in SDK 1.12.0 the runner keeps server-side threads and appends every reply itself, while the route must decide what is stored (refused replies are left out; a tool call cut off at `max_tokens` gets an error result so the history stays valid). It streams the newline-delimited events defined in `lib/agents/events.ts`; `components/create/use-letter-chat.ts` turns them into chat state. Replies are plain text with paragraphs and **bold** only, because the chat renders nothing else.
- **Tools the main agent can call:**
  - `suggest_templates`: the chat shows clickable template cards; a click sends an ordinary message.
  - `research_gifts`: runs the research sub-agent.
  - `build_letter`: runs the builder sub-agent, saves the result, and the preview reloads.
  - `edit_letter`: the builder again, given the current content and the requested change.
- **Research sub-agent** (`research.ts`): its own tool loop with Anthropic's web search (`web_search_20260209`, at most 4 searches) and a `report_gifts` tool it calls once at the end with 3–5 ideas (title, reason, price, link). When `TAVILY_API_KEY` is set, the search runs on Tavily instead, through a client tool `search_web` (`lib/agents/tavily.ts`: 5 trimmed results per search, an 8-second timeout, a failed search returned to the model as an error) with the same caps, and Anthropic's web search remains the fallback when the key is empty.
- **Builder sub-agent** (`builder.ts`): one `client.beta.messages.parse` call with `betaZodOutputFormat` of the content schema (the beta namespace, because `fallbacks` and `block_binding` exist only there), validated again with zod and retried once. Today's date and the sender's timezone (Europe/Berlin when the browser sends none) go in the user message.

Rules the current models impose:

- Store the conversation exactly as the API returned it, including thinking blocks, in `letters.chat`, and replay it unchanged and append-only. Never rebuild history from our own objects.
- Keep the system prompt and tool list byte-stable: no dates or per-user text in `system`. Set `thinking.block_binding.prefix_mismatch_behavior` to `drop_block` (beta `thinking-binding-controls-2026-08-01`), so a prompt fix during the night cannot break chats already in progress.
- Set effort with `output_config: { effort: "low" }`. Do not send `temperature`, a thinking budget, or a forced `tool_choice`; all three are rejected.
- Check `stop_reason` for `"refusal"` and show a friendly "try again". Turn on `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`).
- The chat route streams for as long as the model takes. On Cloudflare, time spent waiting on the model does not count against the CPU limit, but the work around it does: see the plan limits in [setup.md](setup.md).

Verified live on `claude-opus-5-5` (21 November): `output_config.effort`, `block_binding: drop_block` (stored history replayed after a JSON round trip with no input transformations), `fallbacks: "default"` (accepted; an actual fallback was not triggered), effort and format sharing one `output_config`, and `web_search_20260209` with `max_uses: 4`. Re-run the manual check after changing a prompt or the SDK: `npx vitest run --config scripts/agent-smoke.config.mts` (about 20 short paid requests).

Limits in the chat route on top of the spending guard: messages over 4,000 characters are refused, one message triggers at most 6 model requests, and research stops after 4 searches and 4 requests.

Not tonight: Claude Managed Agents, where Anthropic hosts the agent loop and a sandbox. It is in beta and adds session start-up to a chat that has to feel instant.

### Billing (Stripe)

- Build from the Stripe skills and the Stripe MCP server in this repo, not from memory.
- Plans and limits come from `lib/plans.ts`. Free users get 3 gifts a month; advent calendars and `research_gifts` require Full moon.
- Flow: "Choose Full moon" → sign in → `POST /api/checkout` creates a Stripe-hosted Checkout Session in subscription mode with one €4.99 monthly price, tied to the user's Stripe customer → Stripe returns to `/billing/return`, which retrieves the session and sets `profiles.plan` → a webhook (`customer.subscription.updated` / `deleted`, signature verified) keeps the plan current through renewals, failed payments and cancellations.
- Cancelling: the Stripe customer portal, linked from the dashboard. Full moon stays active until the end of the paid period (`cancel_at_period_end`), as the landing page promises.
- A user who hits a Full moon feature on the free plan sees what it unlocks and a "Choose Full moon" button, not an error.

### Daytona redesign (only if everything else is done)

A sender can ask for a one-off look ("designed for you"). Claude Code, running in a Daytona sandbox, writes one self-contained HTML page from the letter's content. We store the page with the letter and delete the sandbox, so the result never depends on the sandbox existing. Letters only: a calendar baked into one static page would carry its locked doors.

- **Snapshot** (`majnu-letters-v1`, built by `scripts/daytona/build-snapshot.mts` in the `eu` region): Node 22, Claude Code pinned to the `stable` release, and the project it works in, `daytona/sandbox/`. That project holds the `majnu-letter` skill (the page rules), `CLAUDE.md`, permissions that allow only file tools, the template sources and schema as reference, and one rendered example per template (`scripts/daytona/export-references.mts`). Snapshots are immutable: after changing templates, the skill or the CLI version, build `majnu-letters-v2` and set `DAYTONA_SNAPSHOT`. The alternative was a plain sandbox with the templates pushed in from Supabase at every start. A snapshot starts faster, pins the CLI, and takes the same upkeep (one script run when the templates change).
- **The job** (`lib/daytona/redesign.ts`) starts an ephemeral sandbox whose network reaches only `api.anthropic.com` and which destroys itself after 20 minutes whatever happens. It uploads `content.json`, the request and the prompt as files, so no user text is ever part of a command. It runs `claude --print` with at most 40 turns and a 6-minute `timeout`, passing `ANTHROPIC_API_KEY` and `MAJNU_MODEL` in that one command's environment only. It downloads `out/index.html` and deletes the sandbox, also on errors. Only then does it check the page (`lib/daytona/validate.ts`: size, no network references, no forms or storage, links only to the letter's gift URLs, gift codes only inside the script, no keys) and insert it into `letter_designs` (migration `0003`). `DAYTONA_ANTHROPIC_API_KEY`, a key of its own with a low spend limit, is used when set, because the sandbox runs the model on text a stranger wrote.
- **Serving:** `GET /l/[slug]/design` returns the newest design with `Content-Security-Policy: sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox; default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'`, plus `nosniff`, `no-referrer`, `noindex` and `no-store`. The header is the security boundary, because this is user-influenced HTML on our domain. The page gets an opaque origin and the browser makes no requests for it; `allow-popups` exists only so gift links (`target="_blank"`) open the shop in a normal tab. `/l/[slug]` shows the design in an iframe when `getLatestDesignInfo(slug)` finds one.
- **Running it:** it takes minutes, so it cannot run inside a Worker request. Today it runs by hand: `node scripts/daytona/redesign.mts <letterId> "<request>"`. In production, a `redesign_letter` tool should check ownership, the plan and a per-user daily limit, then put `{ letterId, request }` on a Cloudflare Queue. A consumer Worker has 15 minutes of wall time per message, enough for one run, with `max_retries: 0` (a retry is another paid run) and a dead-letter queue. The consumer may need the job's few Daytona calls rewritten as `fetch`, if the SDK does not bundle for Workers. A small jobs table would let the chat show progress.

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
- Free user: the 4th gift in a month and any advent calendar or gift research show the upgrade prompt. Subscribe with a Stripe test card, return, and those unlock; cancel in the customer portal and the plan stays active until the period ends. Repeat once with a real card after going live.
- Phone-width pass on every template and the create page, then on two real phones.
- After the final deploy, repeat sign-in → letter → open on https://majnu.app.
