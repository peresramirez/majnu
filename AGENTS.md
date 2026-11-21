# Majnu: instructions for coding agents

Majnu is a personalized digital gifting platform: a chat with an AI agent becomes a gift, letter, invitation or advent calendar made for one person, shared as a link and tracked when opened. Two developers are building it in parallel against a deadline of a few hours, each with their own coding agent. These rules exist so the two streams of work fit together without anyone stopping to coordinate.

Read [docs/plan.md](docs/plan.md) before you change anything. It is the source of truth for architecture, file ownership and schedule. [docs/setup.md](docs/setup.md) covers keys and services.

## Who you are working for

The work is split between **Dev A** (agent, data, payments) and **Dev B** (templates, public pages, brand). The ownership table is in `docs/plan.md`. If you do not know which developer you are working for, ask before editing.

- Edit only files your developer owns. If a change is needed on the other side, describe it to your developer so they can pass it on.
- The contract files (`lib/letters/schema.ts`, `templates.ts`, `fixtures.ts`, and the exported signatures of `store.ts`) are shared. After setup, only add to them, and only when both developers agree. Renaming or removing a field breaks the other developer's work without warning.
- Dev A never imports template components. Dev B never imports agent code. The seam is `getPublicLetter()` and `toPublicView()` in one direction and `<LetterRenderer>`, `<SharePanel>` and `<TemplateCard>` in the other.

## Commands

```bash
npm run dev          # local server
npm run typecheck    # run before every push: the production build ignores type errors
npm test             # unit tests, no network
npm run test:smoke   # read-only checks that each key in .env.local works
npm run build
```

`npm install` relies on `legacy-peer-deps` from `.npmrc`. Peer dependencies are therefore not installed automatically; add them by hand when a package asks for one.

## Git

- Work on your developer's branch (`dev-a` or `dev-b`). Rebase on `main` before merging, and merge at each checkpoint in the plan.
- Commit only when your developer asks. Keep commits small with a plain, imperative subject and a short body saying why.
- **No AI attribution anywhere.** Do not add `Co-Authored-By` lines for an AI tool, "Generated with" footers, or similar text to commits, pull requests, code comments or docs.
- Do not push, deploy, or change settings on Cloudflare, Supabase or Stripe unless your developer asks.
- Deploy only with `npm run deploy`. Never run `opennextjs-cloudflare deploy` or `wrangler deploy` yourself: the adapter copies every `.env` file into the Worker, so a build in a working directory would upload the secrets in `.env.local`. The script builds a clean copy of the committed code instead.

## Secrets

- Keys live in `.env.local`, which is not committed. `.env.sample` lists the names. Never print a key, paste one into a file that is tracked, or put one in a URL.
- `docs/internal/` and `.claude/settings.local.json` are private and ignored by git. Do not read from them into tracked files.
- `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY` and `DAYTONA_API_KEY` are server only. Any module that touches one starts with `import "server-only"`. Only variables prefixed `NEXT_PUBLIC_` may reach the browser.

## Rules that protect users

Letters contain private messages and gift codes, and strangers arriving from ads spend our API budget.

- `letters` and `letter_events` have row-level security on and no anonymous read policy. Public reads go through `lib/supabase/admin.ts`, by exact slug, on the server.
- Locked calendar doors are removed on the server before rendering. Their text must never appear in the HTML or in any API response.
- `paid`, `slug` and `owner_id` are written only by server code, never from a value the browser sent.
- Link previews and page titles stay generic ("A letter for Anna"). No message text, no gift codes.
- Keep the per-user limits (letters per day, chat turns per letter) in place on every route that calls the model.

## Working with the model API

- Use the official `@anthropic-ai/sdk`. Do not add another AI library.
- The model id comes from `MAJNU_MODEL`, default `claude-opus-5-5`. Do not hardcode a model or change the default.
- Current models reject `temperature`, a thinking budget and a forced `tool_choice`. Set depth with `output_config: { effort }`.
- Store conversation history exactly as the API returned it and replay it append-only. Keep the system prompt and tool definitions byte-stable; per-request facts such as today's date go in the user message.
- Check the SDK reference before writing a call rather than relying on memory; parameter names changed across model generations.

## Payments and database

- Before changing anything in Postgres (tables, policies, indexes, functions), consult the Supabase guidance in `.claude/skills/`. Schema changes are migration files in `supabase/migrations/`.
- Before writing Stripe code, consult the Stripe guidance in `.claude/skills/`. Use Stripe-hosted checkout and verify payment on the server.

## Interface

- Most visitors arrive on a phone from an ad or a chat app. Build every screen phone-first and check it at 375px wide.
- Public letter pages are full-bleed with no site header or footer.
- Use Tailwind and the components in `components/ui/`. Do not add a second UI library.

## Tests

- Unit tests go in `tests/unit/`, mirroring the path of the file they cover (`lib/letters/store.ts` → `tests/unit/lib/letters/store.test.ts`).
- Anything in "Rules that protect users" needs a test: door locking, the stripped public view, payment gating, limits.
- Tests that call a real service go in `tests/smoke/` and must be read-only and free to run.

## Documentation

- Planning lives in `docs/`. When a decision in `docs/plan.md` changes, update the plan in the same change.
- Write for a teammate who was not in the room: complete sentences, the reason behind a rule, no shorthand.
