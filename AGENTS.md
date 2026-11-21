# Majnu: instructions for coding agents

Majnu is a personalized digital gifting platform: a chat with an AI agent becomes a gift, letter, invitation or advent calendar made for one person, shared as a link and tracked when opened. Two developers are building it in parallel against a deadline of a few hours, each with their own coding agent. These rules exist so the two streams of work fit together without anyone stopping to coordinate.

Read [docs/plan.md](docs/plan.md) before you change anything. It is the source of truth for architecture, file ownership and schedule. [docs/setup.md](docs/setup.md) covers keys and services.

## Who you are working for

The work is split between **Dev A** (agent, data, payments) and **Dev B** (templates, public pages, brand). The ownership table is in `docs/plan.md`. If you do not know which developer you are working for, ask before editing. A task session started by a lead session (see "Working in parallel") works for that lead's developer, and its brief is its instructions.

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

- The lead session (see below) works on `main`. Every parallel task gets its own branch, `task/<name>`, in its own worktree. Without a lead, each developer's agent works on `dev-a` or `dev-b`, rebases on `main` before merging, and merges at each checkpoint in the plan.
- Commit when your developer or your task brief asks; a brief that tells you to commit and push your task branch is that request. Keep commits small with a plain, imperative subject and a short body saying why.
- **No AI attribution anywhere.** Do not add `Co-Authored-By` lines for an AI tool, "Generated with" footers, or similar text to commits, pull requests, code comments or docs.
- Push only the branch you were given. Only the lead merges into `main` and pushes it. Do not deploy, or change settings on Cloudflare, Supabase or Stripe, unless your developer asks.
- Deploy only with `npm run deploy`. Never run `opennextjs-cloudflare deploy` or `wrangler deploy` yourself: the adapter copies every `.env` file into the Worker, so a build in a working directory would upload the secrets in `.env.local`. The script builds a clean copy of the committed code instead.

## Working in parallel

The session your developer talks to is the **lead**. It splits work into tasks that touch separate files, starts one **task session** per task, and merges their branches. One task is one branch (`task/<name>`, from `main`), one git worktree (`.claude/worktrees/<name>`) and one agent session in its own terminal workspace, so the developer can watch every session and step in.

Every task session works through the same five steps:

1. **Plan.** Read this file, CLAUDE.md, `docs/plan.md` and the files the task names. Write a short plan (what changes, which files, how it will be checked) before editing.
2. **Build.** Edit only the files the brief gives you. Contract files change only if the brief says so; otherwise report the change you need.
3. **Verify** with the tools you have, as described in "Checking your work".
4. **Bring in `main`, then commit and push.** Before your final push, fetch and merge the latest `main` into your branch (`git fetch origin && git merge origin/main`), resolve every conflict yourself (keep both sides' intent; for tables such as `docs/features/README.md`, keep every row), and rerun `npm run typecheck`, `npm test` and `npm run build` on the result. Push your task branch only, then wait for its CI run (`gh run watch`) and fix it until it is green. The lead's merge into `main` should then have nothing to resolve.
5. **Open a pull request, report and stop.** Open a pull request from your branch into `main` (`gh pr create --base main --head task/<name>`). Its title is a plain summary; its description is your report: what changed, the issues it covers as `Refs #<n>` (not `Closes`, because the lead closes issues after checking), what you verified and how, what you did not verify, and what the lead must do next (contract changes, migrations, secrets). No AI attribution. Reply to the lead with the pull request's link and the same report, then wait. If `main` moves before your pull request is merged, the lead asks you to merge it again: repeat step 4 and push.

A brief from the lead always states the goal, the files the session owns, the files it must not touch, the contract it codes against, how to verify the work (including its own dev-server port), and that contract changes are reported, not made.

The lead:

- never gives two sessions the same files, and gives each session its own dev-server port (3101, 3102 and so on);
- applies database migrations itself, with a dry run first;
- merges work only through the session's pull request, and only when the job is done (the description covers every item of the brief and the diff matches it), GitHub shows the pull request as up to date with `main` and free of conflicts (`gh pr view <n> --json mergeStateStatus` is `CLEAN`; if it is `BEHIND` or `DIRTY`, the lead sends the session back to merge `main` and re-verify), and its checks are green;
- merges one pull request at a time (`gh pr merge <n> --merge`, which keeps a merge commit like `--no-ff`), pulls `main`, reruns `npm run typecheck`, `npm test` and `npm run build`, checks the result in a browser, and waits for `main`'s CI to be green before deploying;
- closes each session, with its worktree and branch, as soon as its branch is merged;
- closes the GitHub issues the merged work finished (see "GitHub issues");
- deploys only when the developer asks.

How to start, watch and close sessions on this machine is in CLAUDE.md.

## GitHub issues

Work is tracked in the GitHub issues on `peresramirez/majnu`; every task names the issues it covers. An issue is finished when the work is merged into `main`, pushed and checked, not when a task branch is pushed. At that point the lead (or, without a lead, the agent that merged) closes it straight away with a comment saying which commit finished it and how it was checked:

```bash
gh issue close <number> --comment "Done in <commit>: <what now works>. Checked: <how>."
```

If the work covers only part of an issue, leave it open and comment what is done and what is left. Never close an issue for work that is unmerged or unchecked.

## Checking your work

Nothing is done until it has been checked, and every report says how it was checked. If something could not be checked, say so and why; never report it as working.

- **Code:** `npm run typecheck` and `npm test` every time; `npm run build` when you changed code that ships.
- **Anything visible:** open it in a browser at 375px and 1440px wide, read the browser console, tab through it with the keyboard, and check reduced motion wherever something moves.
  - The lead uses **Claude in Chrome** when it is available. It drives your developer's own Chrome, which has their sign-ins, so it can check signed-in pages. Otherwise the lead uses the **Chrome DevTools** MCP server.
  - Task sessions use **their own isolated Chrome** through the Chrome DevTools MCP server named `browser`, never Claude in Chrome: several sessions sharing one browser would take over each other's tabs. Task sessions cannot sign in with Google, so they check signed-in screens on a temporary page with mock data, delete that page before committing, and leave the signed-in check to the lead.
- **API routes:** call them with `curl` against your dev server and check the status code and the body, including the error cases.
- **The model API:** a few short live calls are fine to confirm a request shape. Keep them few: every call costs money.
- **Database:** write migrations as files in `supabase/migrations/`. The lead applies them (`supabase db push --remote=<project-ref> --dry-run` first, then without `--dry-run`) and checks the security rules with only the anon key.

## Secrets

- Keys live in `.env.local`, which is not committed. `.env.sample` lists the names. Never print a key, paste one into a file that is tracked, or put one in a URL.
- `docs/internal/` and `.claude/settings.local.json` are private and ignored by git. Do not read from them into tracked files.
- `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY` and `DAYTONA_API_KEY` are server only. Any module that touches one starts with `import "server-only"`. Only variables prefixed `NEXT_PUBLIC_` may reach the browser.

## Rules that protect users

Letters contain private messages and gift codes, and strangers arriving from ads spend our API budget.

- `letters` and `letter_events` have row-level security on and no anonymous read policy. Public reads go through `lib/supabase/admin.ts`, by exact slug, on the server.
- Locked calendar doors are removed on the server before rendering. Their text must never appear in the HTML or in any API response.
- A user's plan (`profiles`), `slug` and `owner_id` are written only by server code, never from a value the browser sent.
- Link previews and page titles stay generic ("A letter for Anna"). No message text, no gift codes.
- Keep the per-user limits (letters per day, chat turns per letter) in place on every route that calls the model.

## Working with the model API

- Use the official `@anthropic-ai/sdk`. Do not add another AI library. The one exception is speech to text: OpenAI's transcription endpoint, called with plain `fetch` (no OpenAI SDK), only for turning voice into text (see "Voice" in docs/plan.md).
- The model id comes from `MAJNU_MODEL`, default `claude-opus-5-5`. Do not hardcode a model or change the default.
- Current models reject `temperature`, a thinking budget and a forced `tool_choice`. Set depth with `output_config: { effort }`.
- Store conversation history exactly as the API returned it and replay it append-only. Keep the system prompt and tool definitions byte-stable; per-request facts such as today's date go in the user message.
- Check the SDK reference before writing a call rather than relying on memory; parameter names changed across model generations.

## Payments and database

- Before changing anything in Postgres (tables, policies, indexes, functions), consult the Supabase guidance in `.claude/skills/`. Schema changes are migration files in `supabase/migrations/`.
- Before writing Stripe code, consult the Stripe guidance in `.claude/skills/`. Use Stripe-hosted checkout in subscription mode, verify on the server, and keep plan status current with a signature-checked webhook. Prices and limits live in `lib/plans.ts`.

## Interface

- Most visitors arrive on a phone from an ad or a chat app. Build every screen phone-first and check it at 375px wide.
- Public letter pages are full-bleed with no site header or footer.
- Use Tailwind and the components in `components/ui/`. Do not add a second UI library.
- Follow `docs/brand.md` for colours, type, logo use, motion and wording. Use the logo files in `public/brand/`; never retype the wordmark in a font.

## Tests

- Unit tests go in `tests/unit/`, mirroring the path of the file they cover (`lib/letters/store.ts` → `tests/unit/lib/letters/store.test.ts`).
- Anything in "Rules that protect users" needs a test: door locking, the stripped public view, payment gating, limits.
- Tests that call a real service go in `tests/smoke/` and must be read-only and free to run.

## Documentation

- **Every feature has an architecture page** in `docs/features/<feature>.md`, in the outline of `docs/features/README.md` (what it does, how it works with a mermaid diagram, pieces, data and privacy, limits and costs, how it was checked, open questions). The session that builds or changes a feature writes or updates its page in the same branch and adds it to the table in `docs/features/README.md`. `docs/architecture.md` is the overview that links them; the developers present Majnu from these pages, so keep them true to the code.

- Planning lives in `docs/`. When a decision in `docs/plan.md` changes, update the plan in the same change.
- Write for a teammate who was not in the room: complete sentences, the reason behind a rule, no shorthand.
