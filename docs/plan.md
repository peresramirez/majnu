# Majnu: build plan

Majnu lets someone sign in, chat with an AI agent, and get a digital letter, invitation or advent calendar as a web page with a short link and QR code. We track when the recipient opens it.

It has to be live within about 8 hours of starting, so ads can run the same night. Two developers build it in parallel, each with their own coding agent, on `peresramirez/majnu`.

Starting point: the Next.js 15 + Supabase starter runs on Cloudflare Workers at https://majnu.app with Google sign-in set up. There is no database schema, no AI code and no payments yet. Keys and services are described in [setup.md](setup.md).

## Decisions

- **Letters are data, not generated code.** Templates are React pages in our app. The builder agent fills a JSON content object stored in Supabase, so a letter is live in seconds and its link never expires.
- **AI runs on the official Anthropic TypeScript SDK** with our own API key. The model id comes from `MAJNU_MODEL` (default `claude-opus-5-5`, low effort). Switch to `claude-sonnet-5-5` if replies feel slow or costs run high.
- **Billing is Stripe checkout.** Letters are free. Publishing an advent calendar costs a one-off €4.99 (one constant). If Stripe cannot take live payments by checkpoint 2, show the tip link (`NEXT_PUBLIC_TIP_URL`) and make calendars free.
- **Daytona is an optional extra**, built only if everything else is done. Its sandboxes stop 15 minutes after the last SDK call, so anything built there is copied to our storage and served from our domain.

## Architecture

### Routes

| Route | Access | Purpose |
|---|---|---|
| `/` | public | Landing page with live template examples and Google sign-in |
| `/dashboard` | signed in | My letters with open stats and "New letter". First-time users go straight to a new letter |
| `/create/[id]` | owner | Chat, live preview, share panel (link, copy, QR, WhatsApp). Tabs on mobile |
| `/create/[id]/preview` | owner | The letter as the recipient will see it, all calendar doors open, no tracking |
| `/l/[slug]` | public | The letter or calendar, full-bleed, no site chrome |
| `/dev/templates` | public | Every template rendered from fixture data. Dev B's workbench and the source for ad screenshots |
| `/impressum`, `/privacy` | public | Required before ads run in Germany |
| `POST /api/chat` | owner | Main agent, streamed |
| `POST /api/open` | public | Records `open`, `door_open`, `gift_click` |
| `POST /api/checkout`, `GET /paid` | owner | Start Stripe checkout; verify payment on return |

Short link: `majnu.app/l/<slug>`, where the slug is 10 random characters from `crypto.randomBytes`.

`/l/[slug]` is `noindex`, sends no referrer, is always rendered on request, and loads no third-party scripts. Its link-preview text stays generic ("A letter for Anna"), never the message or a gift code.

### Data

One migration: `supabase/migrations/0001_init.sql`.

- `letters`: `id`, `owner_id` → `auth.users`, `slug` unique, `kind` (`letter` | `calendar`), `template_id`, `title`, `content` jsonb, `chat` jsonb, `paid` bool, `stripe_session_id`, timestamps.
- `letter_events`: `letter_id`, `type`, `day int not null default 0`, `visitor_id`, `user_agent`, `created_at`, with a unique index on `(letter_id, type, day, visitor_id)` so repeat visits do not inflate counts.

Security rules:

- Turn row-level security on explicitly for both tables. Tables created by SQL have it off by default.
- Owners can read their own letters and update only the content columns. `paid`, `slug` and `owner_id` are written only by server code.
- There is no anonymous read policy. The public page, `/api/open` and the link-preview image use a server-only service-role client (`lib/supabase/admin.ts`) and look up by exact slug. Content holds gift codes, and locked calendar doors must never reach the browser early.
- Agent tools write letter content with the signed-in user's client, so the database enforces ownership.

Calendar unlocks: door N opens on `startDate + (N-1)` days. Compare calendar dates in the calendar's timezone (`Intl.DateTimeFormat("en-CA", { timeZone })`), not timestamps. The server removes the content of locked doors before rendering. In the owner's preview every door is open; otherwise a calendar starting 1 December shows nothing but locked doors while it is being made.

Open tracking: a small client beacon fires on page load, so link-preview crawlers (WhatsApp, iMessage) do not count. The server resolves the slug and ignores events for locked doors. The dashboard shows first opened, last opened, total opens and unique visitors.

Spending guard, because visitors from ads spend our API key: at most 5 letters per user per day and 40 chat turns per letter, plus a monthly spend limit set in the Anthropic Console.

### The contract between the two developers

These files are written together during setup. After that, changes are additive only and need both people.

- `lib/letters/schema.ts`: zod schemas and types. Import zod as `import * as z from "zod/v4"`, because the Anthropic SDK's zod helpers require it.
  - `LetterContent`: `recipientName`, `senderName`, `occasion`, `headline`, `body[]`, `signOff`, `theme { palette, font }`, `gifts[] { title, description?, url?, code?, imageUrl?, price? }`, `event? { title, startsAt, locationName, address }`.
  - `CalendarContent`: `recipientName`, `senderName`, `headline`, `intro`, `startDate`, `timezone`, `theme`, `doors[] { day, title, message, gift? }`.
  - `PublicLetter`: what a template receives. Doors are either `{ day, locked: true }` or `{ day, locked: false, ... }`.
- `lib/letters/templates.ts`: template metadata only (`id`, `kind`, `name`, `description`, `bestFor`). It imports no components, so a broken template cannot take down the chat route.
- `lib/letters/fixtures.ts`: one realistic example per template.
- `lib/letters/store.ts`: `getPublicLetter(slug)` and `toPublicView(letter, now, { ownerPreview })`. During setup `getPublicLetter` returns fixtures for `demo-letter` and `demo-calendar`, so Dev B is never blocked on the database or the agent.

Template ids, fixed now: letters `classic-envelope`, `wedding-invite`, `party-invite`, `gift-reveal`, `postcard`; calendars `advent-classic` (24 doors) and `countdown` (any number of days, any occasion).

### Agents

All agent code runs on the server in `lib/agents/`.

- **Main agent** (`main.ts`): leads the conversation in steps: who the letter is for and the occasion → template → message and details (date and place for invitations, gifts) → build → share → offer a calendar. The template list from `templates.ts` goes into its system prompt. It runs as a tool loop (`client.beta.messages.toolRunner`) in `POST /api/chat` and streams newline-delimited events (`text`, `tool`, `refusal`, `error`, `done`). A small client hook, `components/create/use-letter-chat.ts`, turns those into chat state.
- **Tools the main agent can call:**
  - `suggest_templates`: the chat shows clickable template cards; a click sends an ordinary message.
  - `research_gifts`: runs the research sub-agent.
  - `build_letter`: runs the builder sub-agent, saves the result, and the preview reloads.
  - `edit_letter`: the builder again, given the current content and the requested change.
- **Research sub-agent** (`research.ts`): its own tool loop with Anthropic's web search (`web_search_20260209`, at most 4 searches) and a `report_gifts` tool it calls once at the end with 3–5 ideas (title, reason, price, link).
- **Builder sub-agent** (`builder.ts`): one `client.messages.parse` call with `zodOutputFormat` of the content schema, so its output always validates. Today's date and the sender's timezone go in the user message.

Rules the current models impose:

- Store the conversation exactly as the API returned it, including thinking blocks, in `letters.chat`, and replay it unchanged and append-only. Never rebuild history from our own objects.
- Keep the system prompt and tool list byte-stable: no dates or per-user text in `system`. Set `thinking.block_binding.prefix_mismatch_behavior` to `drop_block` (beta `thinking-binding-controls-2026-08-01`), so a prompt fix during the night cannot break chats already in progress.
- Set effort with `output_config: { effort: "low" }`. Do not send `temperature`, a thinking budget, or a forced `tool_choice`; all three are rejected.
- Check `stop_reason` for `"refusal"` and show a friendly "try again". Turn on `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`).
- The chat route streams for as long as the model takes. On Cloudflare, time spent waiting on the model does not count against the CPU limit, but the work around it does: see the plan limits in [setup.md](setup.md).

Smoke-test before building the UI on top (not yet verified against the live API): that `block_binding`, `fallbacks` and `output_config` pass through `toolRunner`; that `effort` and `format` can share one `output_config`; and that `runner.params.messages` includes the final assistant turn.

Not tonight: Claude Managed Agents, where Anthropic hosts the agent loop and a sandbox. It is in beta and adds session start-up to a chat that has to feel instant.

### Billing (Stripe)

- Build from the Stripe skills and the Stripe MCP server in this repo, not from memory.
- Flow: "Unlock calendar" → `POST /api/checkout` creates a Stripe-hosted checkout for the letter (cards and wallets only) and saves `stripe_session_id` → Stripe returns to `/paid` → the server retrieves the session, confirms it is paid and belongs to a letter this user owns, and sets `letters.paid`.
- No webhook in the first version. If a buyer closes the tab before returning, the create page and dashboard re-check any letter that has a session id and is still unpaid.
- Unpaid calendar: the owner can preview it, the share panel is locked behind the unlock button, and other visitors see "not activated yet".

### Daytona redesign (only if everything else is done)

A `redesign_letter` tool queues a job. The job starts a sandbox, runs Claude Code on an exported copy of the page with its own low-limit Anthropic key, downloads one self-contained HTML file, stores it with the letter and deletes the sandbox. `/l/[slug]` serves that file in a sandboxed iframe with a `Content-Security-Policy: sandbox allow-scripts` header, because it is user-influenced HTML on our domain.

### Brand

The look is an airmail envelope, because the product is mail. It is defined once and reused:

- Colours in `tailwind.config.ts` under `airmail`: `blue` (page ground), `red` (the one call to action), `paper`, `ink`, `postmark`, `sun`.
- Type in `app/fonts.ts`: Bricolage Grotesque for headings and body (`font-sans`), Courier Prime for labels and prices (`font-mono`), Caveat for handwriting (`font-hand`).
- Two CSS helpers in `app/globals.css`: `.airmail-edge` (the red and blue border) and `.stamp-perf` (perforated stamp edge; width and height must be multiples of 12px).
- The main action is always worded "Write a letter".

Letter and calendar templates may use their own palettes; the site chrome around them stays in this one.

## Who builds what

After the shared setup, neither developer edits the other's files.

| | Dev A: agent, data, money | Dev B: templates, public pages, brand |
|---|---|---|
| Owns | `supabase/`, `lib/supabase/*`, `middleware.ts`, `lib/letters/store.ts`, `lib/agents/*`, `lib/billing/*`, `app/api/*`, `app/(app)/dashboard/**`, `app/(app)/create/**`, `components/create/*` | `app/layout.tsx` and route-group layouts, `app/(marketing)/**`, `app/(public)/**`, `components/letters/**`, `components/calendars/**`, `components/share/**`, `public/**`, branding |
| Builds | Migration and security rules, admin client, middleware fix, agents and tools, chat UI, dashboard with stats, open tracking, limits, Stripe | 5 letter templates, 2 calendar templates with locked-door UI, renderer and the id-to-component map (`components/letters/registry.tsx`), map embed, gift reveal, share panel with QR, open beacon, landing page, legal pages, link-preview image, rebrand |
| Hands over | `getPublicLetter()`, `toPublicView()`, `/api/open` | `<LetterRenderer letter />`, `<SharePanel url locked onUnlock />`, `<TemplateCard id />` |

## Shared setup (first 30 minutes, together)

1. Dev A: write and apply the migration; add `lib/supabase/admin.ts` with `import "server-only"`; rewrite `lib/supabase/middleware.ts` to the official `@supabase/ssr` cookie pattern (the template's version drops refreshed sessions, which would log senders out mid-chat), remove its `console.log`, protect `/create`, and exclude `l/` and `api/open` from the matcher.
2. Dev B: add the `(public)` route group for `/l/[slug]` and the legal pages. Already done: the root layout is reduced to providers and metadata, the landing page lives in `app/(marketing)/`, and the signed-in pages live in `app/(app)/` with their own container and footer.
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
- With only the public anon key, `select` on `letters` returns no rows, and an owner cannot set `paid` from the browser console.
- Unpaid calendar: share panel locked for the owner, "not activated" for others. Pay with a Stripe test card, return, share panel unlocks. Repeat once with a real card after going live.
- Phone-width pass on every template and the create page, then on two real phones.
- After the final deploy, repeat sign-in → letter → open on https://majnu.app.
