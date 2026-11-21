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
| `frontend-design` | Letter and calendar templates, the landing page |
| `claude-api` (built in) | Every call to the Anthropic API |

**MCP servers** are defined in `.mcp.json`: `supabase` (apply migrations, run SQL, read logs) and `stripe`. Run `/mcp` to sign in. If a server shows as disabled, it is switched off in your personal `.claude/settings.local.json`.

**Settings** in `.claude/settings.json` turn off commit and pull-request attribution for everyone on the project. Keep it that way.

The Vercel plugin, if you have it installed, recommends the Vercel AI SDK and AI Gateway by default. This project deliberately uses the official Anthropic SDK with its own API key; follow `docs/plan.md` where the two disagree.
