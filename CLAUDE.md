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
| `claude-api` (built in) | Every call to the Anthropic API |

Site chrome (landing, sign-in, dashboard, create page) keeps the airmail brand recorded in `docs/plan.md`, whatever a design skill suggests. Letter and calendar templates are free to have their own look.

**MCP servers** are defined in `.mcp.json`: `supabase` (apply migrations, run SQL, read logs) and `stripe`. Run `/mcp` to sign in. If a server shows as disabled, it is switched off in your personal `.claude/settings.local.json`.

**Settings** in `.claude/settings.json` turn off commit and pull-request attribution for everyone on the project. Keep it that way.

The Vercel plugin, if you have it installed, recommends the Vercel AI SDK and AI Gateway by default. This project deliberately uses the official Anthropic SDK with its own API key; follow `docs/plan.md` where the two disagree.
