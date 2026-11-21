# Majnu

@AGENTS.md

## Claude Code specifics

**Skills** are installed in `.claude/skills/` and load automatically when relevant. Load them yourself when starting work in their area:

| Skill | Use it for |
|---|---|
| `supabase` | Auth, sessions, `@supabase/ssr`, row-level security, the Supabase MCP server |
| `supabase-postgres-best-practices` | Any table, policy, index or SQL change |
| `stripe-best-practices`, `stripe-docs` | Checkout, key handling, looking up Stripe API details |
| `stripe-implementation-planner` | Deciding how a new payment feature should be built |
| `design-taste-frontend` | Letter and calendar templates and new pages. It runs a browser check on what it builds; working files go to `.taste-skill/` |
| `frontend-design` | Quick design guidance when the full Taste Skill run is more than the task needs |
| `cloudflare`, `wrangler`, `workers-best-practices` | Anything touching the Worker, `wrangler.jsonc` or Cloudflare products |
| `workers-profiling` | Measuring CPU time against the plan limits |
| `cloudflare-email-service` | Email routing and sending on majnu.app |
| `nextjs-on-cloudflare`, `agents-sdk` | Reference only. This app is deployed with the OpenNext adapter and its agents use the Anthropic SDK; do not migrate to vinext or the Cloudflare Agents SDK without a decision in `docs/plan.md` |
| `bfl-api`, `flux-image-best-practices`, `flux-3-*` | Generating images or video for the site with `BFL_API_KEY`. Each generation spends credits, so ask your developer before running more than a few |
| `claude-api` (built in) | Every call to the Anthropic API |

Site chrome (landing, sign-in, dashboard, create page) follows the Night Post brand in `docs/brand.md`, whatever a design skill suggests: use the logo files in `public/brand/`, never retype the wordmark. Letter and calendar templates are free to have their own look.

**MCP servers** are defined in `.mcp.json`: `supabase` (apply migrations, run SQL, read logs) and `stripe`. Run `/mcp` to sign in. If a server shows as disabled, it is switched off in your personal `.claude/settings.local.json`.

**Settings** in `.claude/settings.json` turn off commit and pull-request attribution for everyone on the project; keep it that way. They also allow the routine commands task sessions run without asking (checks, `git add`/`commit`, pushes to `task/*`, the local dev server, the `browser` MCP server) and deny direct `wrangler` and `opennextjs-cloudflare` deploys.

The Vercel plugin, if you have it installed, recommends the Vercel AI SDK and AI Gateway by default. This project deliberately uses the official Anthropic SDK with its own API key; follow `docs/plan.md` where the two disagree.

## Parallel sessions with Herdr

On this machine Claude Code runs inside Herdr, a terminal workspace manager for coding agents (`HERDR_ENV=1` in its panes). The lead session starts and closes task sessions with `scripts/agents/session.sh`, following "Working in parallel" in AGENTS.md:

```bash
# Write the brief to a file first: goal, files owned, files not to touch, contract, how to verify.
scripts/agents/session.sh start <name> --port 3101 --brief <file>
herdr agent wait <name> --timeout 1800000    # returns when the session is idle, done or blocked
scripts/agents/session.sh status <name>      # its state and latest output
herdr agent prompt <name> "<follow-up>"      # answer its question or ask for a fix
gh run list --branch task/<name> --limit 1        # CI for the branch's last commit: must be green to merge
gh workflow run CI --ref task/<name> && gh run watch   # when a branch has no run yet
# ...review, merge into main, rerun the checks, push main, wait for main's CI...
gh issue close <number> --comment "Done in <commit>: ... Checked: ..."   # each issue the merge finished
scripts/agents/session.sh close <name>       # ends the session, removes worktree and branch
```

What `start` does: creates branch `task/<name>` from `main` and a worktree in `.claude/worktrees/<name>`; opens it as its own Herdr workspace, so it shows in the sidebar and you can watch it or type into it; copies the gitignored `.env.local` and `.claude/settings.local.json` into it; runs `npm ci`; starts Claude Code there; and sends `scripts/agents/brief-header.md` (the five steps, the branch and the port) followed by the brief. `close` refuses to remove a branch that is not merged into `main` unless given `--force`. On this machine `start` takes about five minutes (mostly `npm ci`) and `close` a few minutes (deleting the worktree's `node_modules`), so run them in the background. This machine has 16 GB of memory: run at most two task sessions at a time, and `start` refuses to launch one when less than 30% of memory is free (`MAJNU_MIN_FREE_PCT` changes the threshold).

Each task session gets the same access as the lead: the user-level MCP servers and skills on this machine, the project's `.mcp.json` servers and skills in `.claude/skills/`, the same keys, and the project permissions above. It starts with `--dangerously-skip-permissions`, at the developer's request, so it works through its task without stopping for approvals; its limits are the brief (never push or merge `main`, never deploy) and the deny rules in `.claude/settings.json`. It also starts without Claude in Chrome (`--no-chrome`) and with one extra MCP server, `browser`: Chrome DevTools in an isolated, throwaway profile (`scripts/agents/browser-mcp.json`), so parallel sessions never share a browser.

Browser tools, in short: the lead uses Claude in Chrome (`mcp__claude-in-chrome__*`) when it is connected and `chrome-devtools` otherwise; task sessions use `browser`.

A `blocked` session is waiting on a question (or, rarely, a prompt that bypass mode still shows). Read it with `status`. Answer what the brief and the plan already settle; anything that needs your developer's approval goes to your developer, who can answer in that session's workspace. Never approve on their behalf what they have not authorised.

Keep in-process subagents (the Agent tool) for read-only research and reviews. Build in Herdr sessions, so your developer can see and steer every one.
