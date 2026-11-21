# Setup

How to get a working local copy, and which keys and services the app needs.

## Local setup

```bash
git clone https://github.com/peresramirez/majnu.git
cd majnu
npm install
cp .env.sample .env.local   # then fill in the values below
npm run test:smoke          # checks every key reaches its service
npm run dev                 # http://localhost:3000
```

Node 22 or newer. `npm install` uses `legacy-peer-deps` (set in `.npmrc`) because two UI packages have not declared React 19 support.

Ask a teammate for the `.env.local` values over a private channel. Never commit them or paste them into chat with a coding agent; put them straight into the file.

## Keys

| Variable | Where it comes from | Used for |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API keys | Sign-in and the signed-in user's own data |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page, the secret key | Server-only reads of public letters and open tracking. Bypasses row-level security, so it never goes in client code |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` locally, `https://majnu-app.vercel.app` in production | Google sign-in redirect, share links |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API keys | The agents. Server only |
| `MAJNU_MODEL` | Optional | Defaults to `claude-opus-5-5` |
| `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe Dashboard → Developers → API keys | Checkout. Use test keys until the account is live |
| `NEXT_PUBLIC_TIP_URL` | Optional | "Pay what you want" link, shown if Stripe is not live |
| `DAYTONA_API_KEY` | Optional, app.daytona.io → API keys | Only for the Daytona redesign extra |

Production values live in the Vercel project `majnu` (Settings → Environment Variables, or `npx vercel env add`).

## Services

**Supabase** (project `layla-hack`, region eu-central-1)

- Authentication → URL Configuration: Site URL `https://majnu-app.vercel.app`; redirect URLs `https://majnu-app.vercel.app/**` and `http://localhost:3000/**`. Without these, Google sign-in on the live site returns people to localhost.
- Authentication → Providers → Google is enabled with our Google Cloud OAuth client. In Google Cloud, the authorised redirect URI is `https://<project-ref>.supabase.co/auth/v1/callback`.
- Database changes go in `supabase/migrations/` and are applied through the Supabase MCP server or the SQL editor.

**Anthropic**

- Turn on web search for the organisation in the Console (the gift research agent uses it).
- Set a monthly spend limit, and check the account's rate-limit tier before ads run.

**Stripe**

- The account must be activated to take live payments. Until then everything runs on test keys.

**Vercel**

- Project `majnu`, production domain https://majnu-app.vercel.app. Deploys are manual: `npx vercel --prod` from the repository owner's machine.

## Coding-agent tooling in this repo

Both developers get the same setup by cloning.

- **Instructions:** `AGENTS.md` (read by most coding agents) and `CLAUDE.md` (Claude Code, which imports `AGENTS.md`).
- **Skills** in `.claude/skills/`, pinned by `skills-lock.json`: `supabase`, `supabase-postgres-best-practices`, `stripe-best-practices`, `stripe-docs`, `stripe-implementation-planner`, `frontend-design`. Restore or update them with `npx skills experimental_install` and `npx skills update -p`.
- **MCP servers** in `.mcp.json`: `supabase` and `stripe`. In Claude Code, run `/mcp` once and sign in to each with your own account.
- **Settings** in `.claude/settings.json`: no AI attribution on commits or pull requests, and the two MCP servers are approved for the project. Personal overrides go in `.claude/settings.local.json`, which is not committed.

## Tests

| Command | What it runs |
|---|---|
| `npm run test:smoke` | `tests/smoke/`: read-only checks that each key in `.env.local` works. Run after changing any key |
| `npm test` | `tests/unit/`: fast tests with no network |
| `npm run typecheck` | TypeScript. Production builds ignore type errors, so run this before every push |
