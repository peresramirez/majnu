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
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` locally; production uses `https://majnu.app` from `.env.production` | Google sign-in redirect, share links |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API keys | The agents. Server only |
| `MAJNU_MODEL` | Optional | Defaults to `claude-opus-5-5` |
| `TAVILY_API_KEY` | Optional, app.tavily.com → API keys | Web search for the gift research agent. Server only. When it is empty, research uses Anthropic's web search instead |
| `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe Dashboard → Developers → API keys | Checkout. Use test keys until the account is live |
| `STRIPE_PRICE_WRAPPER` | Stripe Dashboard → Product catalog → Majnu personalised wrapper → the €2.99 one-time price's id (test mode: `price_1UeMy7Ieh8tCba0kv2rSa9af`) | The price Checkout charges. Test and live mode have different ids; `npm run test:smoke` checks it matches `lib/plans.ts` |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Developers → Webhooks → the endpoint for `https://majnu.app/api/stripe/webhook`, subscribed to `checkout.session.completed`, `.async_payment_succeeded`, `.async_payment_failed` and `.expired` | Verifies that webhook calls come from Stripe |
| `NEXT_PUBLIC_TIP_URL` | Optional | "Pay what you want" link, shown if Stripe is not live |
| `OPEN_HASH_SECRET` | Generate one: `openssl rand -hex 32` | Server only. Mixed into the visitor hash in `/api/open` so the stored visitor id cannot be traced back to an IP address. Without it, opens are not recorded. Changing it makes returning visitors count as new |
| `DAYTONA_API_KEY` | app.daytona.io → API keys | The personalised wrapper's design job (the queue consumer). Server only |
| `DAYTONA_ANTHROPIC_API_KEY` | Optional. Anthropic Console → API keys, a separate key with a low spend limit | Claude Code inside the Daytona sandbox; without it the app's `ANTHROPIC_API_KEY` is used |
| `DAYTONA_SNAPSHOT`, `DAYTONA_TARGET`, `DAYTONA_API_URL` | Optional | Defaults: `majnu-letters-v1`, `eu`, `https://app.daytona.io/api` |
| `ANTHROPIC_API_KEY_FALLBACK`, `OPENAI_API_KEY_FALLBACK`, `DAYTONA_API_KEY_FALLBACK` | Optional. A key from another account of each provider | Used only when the primary is refused for its key, billing, spend limit or quota, for 15 minutes at a time; `ANTHROPIC_API_KEY_FALLBACK` is also Claude Code's fallback in the sandbox. Empty: everything works as without them. Server only ([features/provider-fallbacks.md](features/provider-fallbacks.md)) |
| `FALLBACK_CAP_USD` | Optional, default `150` | US dollars each fallback key may spend per calendar month (UTC), counted by the app in `provider_spend`; `npm run spend` shows the totals. `0` keeps the fallbacks unused |
| `BFL_API_KEY` | Optional, Black Forest Labs dashboard → API keys | Lets coding agents generate images and video (FLUX) for the site during development. Generation spends credits. The running app does not use it, so it is not uploaded to Cloudflare or CI |

Production values come from two places:

- **Public values** (site URL, Supabase URL and publishable key, tip link) are in `.env.production`, which is committed. They ship in the browser bundle anyway.
- **Secrets** are Worker secrets on Cloudflare. `npm run cf:secrets` copies the filled-in secret keys from `.env.local` (`ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_WRAPPER`, `STRIPE_WEBHOOK_SECRET`, `DAYTONA_API_KEY`, `DAYTONA_ANTHROPIC_API_KEY`, `OPEN_HASH_SECRET`, `TAVILY_API_KEY`, `OPENAI_API_KEY`, `APIFY_API_TOKEN`, `ANTHROPIC_API_KEY_FALLBACK`, `OPENAI_API_KEY_FALLBACK`, `DAYTONA_API_KEY_FALLBACK`, `FALLBACK_CAP_USD`) to the Worker in one step. Run it again after changing a key. They never go in a file that is committed or deployed.

## Services

**Supabase** (project `layla-hack`, region eu-central-1)

- Authentication → URL Configuration: Site URL `https://majnu.app`; redirect URLs `https://majnu.app/**` and `http://localhost:3000/**`. Without these, Google sign-in on the live site returns people to localhost.
- Authentication → Providers → Google is enabled with our Google Cloud OAuth client. In Google Cloud, the authorised redirect URI is `https://<project-ref>.supabase.co/auth/v1/callback`.
- Database changes go in `supabase/migrations/` and are applied through the Supabase MCP server or the SQL editor.
- `0001_init.sql` creates `letters`, `profiles` and `letter_events`, the `letter_summaries` view the dashboard reads, and a trigger that gives every new user a free profile. Row-level security is on for all three tables and the `anon` role has no access at all; public pages and `/api/open` read through the service-role client by exact slug. Signed-in users can read their own rows and change only the content columns of their own letters (`kind`, `template_id`, `title`, `content`). The slug, owner, chat and plan are written by server code only.
- After applying it, check with the anon key alone: `select` on `letters` fails or returns no rows, and a signed-in user cannot change `profiles.plan` or `letters.chat` from the browser console.

**Anthropic**

- Turn on web search for the organisation in the Console (the gift research agent uses it).
- Set a monthly spend limit, and check the account's rate-limit tier before ads run.
- **Fallback keys** (issue #67): when a key from another account is set as `ANTHROPIC_API_KEY_FALLBACK` (and likewise for OpenAI and Daytona), the app switches to it only when the primary is refused for its key, billing, spend limit or quota, and spends at most `FALLBACK_CAP_USD` ($150) on it per month. That cap is the app's own estimate, so set a $150 monthly limit on each fallback in the provider's own console too. `npm run spend` shows what each fallback has spent. Details: [features/provider-fallbacks.md](features/provider-fallbacks.md).

**Stripe**

- The account must be activated to take live payments. Until then everything runs on test keys.

**Cloudflare** (hosting, domain and email)

- The app runs as the Worker `majnu`, built with the OpenNext adapter, at https://majnu.app and https://www.majnu.app. Configuration is in `wrangler.jsonc` and `open-next.config.ts`.
- Deploy with `npm run deploy`, which needs `npx wrangler login` once. It deploys the last commit, not your working directory.
- Never run `opennextjs-cloudflare deploy` or `wrangler deploy` directly. The adapter copies every `.env` file into the Worker at build time, so a build in a working directory uploads the secrets in `.env.local` and bakes `http://localhost:3000` into the pages. `scripts/deploy.sh` avoids this by building a clean copy of the committed code.
- `npm run preview` runs the Worker locally. Its build output in `.open-next/` contains your local secrets; it is ignored by git and must not be deployed.
- Plan limits matter here. On Workers Free a request may use 10 ms of CPU. Cached pages measured 1 to 3 ms, but a cold request measured 50 ms, and server-rendered pages typically need 10 to 20 ms. Expect intermittent "Worker exceeded resource limits" errors (1102) on dynamic pages under real traffic unless the account is on Workers Paid.
- Email: `hello@majnu.app` is forwarded to the owner's inbox by Cloudflare Email Routing. Manage addresses with `npx wrangler email routing rules list majnu.app`. A rule can forward to one inbox only; forwarding one address to several people needs an Email Worker. Sending email from the app is not set up.

## Coding-agent tooling in this repo

Both developers get the same setup by cloning.

- **Instructions:** `AGENTS.md` (read by most coding agents) and `CLAUDE.md` (Claude Code, which imports `AGENTS.md`).
- **Skills** in `.claude/skills/`, pinned by `skills-lock.json`. Restore or update them with `npx skills experimental_install` and `npx skills update -p`.
  - Supabase: `supabase`, `supabase-postgres-best-practices`
  - Stripe: `stripe-best-practices`, `stripe-docs`, `stripe-implementation-planner`
  - Cloudflare: `cloudflare`, `wrangler`, `workers-best-practices`, `workers-profiling`, `nextjs-on-cloudflare`, `cloudflare-email-service`, `agents-sdk`
  - Design: `design-taste-frontend` (Taste Skill, about 42 MB of reference images and scripts that drive a local Chrome) and `frontend-design`
  - Black Forest Labs: `bfl-api`, `flux-image-best-practices`, and eight `flux-3-*` skills for video (prompting, generation, audio, product ads)
- **MCP servers** in `.mcp.json`: `supabase` and `stripe`. In Claude Code, run `/mcp` once and sign in to each with your own account.
- **Settings** in `.claude/settings.json`: no AI attribution on commits or pull requests, and the two MCP servers are approved for the project. Personal overrides go in `.claude/settings.local.json`, which is not committed.

## Tests

| Command | What it runs |
|---|---|
| `npm run test:smoke` | `tests/smoke/`: read-only checks that each key in `.env.local` works. Run after changing any key |
| `npm test` | `tests/unit/`: fast tests with no network |
| `npm run typecheck` | TypeScript. Production builds ignore type errors, so run this before every push |

## Continuous integration

`.github/workflows/ci.yml` runs on GitHub Actions for every push to `main`, `dev-a` and `dev-b`, on pull requests, on demand, and once an hour.

- **Type check, unit tests, build:** on pushes and pull requests.
- **Service connections:** runs `npm run test:smoke` against the real services. Supabase and Anthropic must pass. Stripe and Daytona are skipped until their keys exist. The hourly run is this job only, so a revoked key or an exhausted quota is noticed during launch even when nobody is pushing.

Public values come from the committed `.env.production`. Every other key comes from the repository's encrypted Actions secrets. After adding or changing a secret key in `.env.local`, copy it to GitHub with:

```bash
npm run ci:secrets
```

That uploads only the keys the checks use and skips empty ones. It needs the GitHub CLI signed in with access to the repository. A failed run emails the person who last changed the workflow; everyone can see results under the repository's Actions tab.
