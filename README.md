# Majnu

A personalized digital gifting platform. You chat with an AI agent, and it wraps a gift code, a letter, an invitation or an advent calendar in a page made for one person, shared as a link.

You sign in, tell the agent who the gift is for and what the occasion is, pick a template, and get a web page with a short link and a QR code. Add a gift code, a party location with a map, or a calendar that opens one door per day. You can see when the recipient opens it.

Live at https://majnu.app

## Status

Built during a weekend hackathon. Sign-in, the dashboard shell and deployment work today. The agent, the letter templates, open tracking and payments are being built according to [docs/plan.md](docs/plan.md).

## Stack

- Next.js 15 (App Router), React 19, TypeScript
- Tailwind CSS and shadcn/ui components
- Supabase for sign-in (Google) and the database
- Anthropic API for the agents, through the official TypeScript SDK
- Stripe for checkout
- Cloudflare Workers for hosting (through the OpenNext adapter), domain and email

## Getting started

```bash
npm install
cp .env.sample .env.local   # fill in the keys
npm run test:smoke          # checks every key reaches its service
npm run dev
```

[docs/setup.md](docs/setup.md) lists each key, where to get it, and the service settings the app depends on.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Local server on http://localhost:3000 |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript check (the build does not fail on type errors) |
| `npm test` | Unit tests in `tests/unit/` |
| `npm run test:smoke` | Read-only checks that each key in `.env.local` works |
| `npm run deploy` | Deploy the last commit to Cloudflare from a clean copy |
| `npm run preview` | Run the production build locally in the Workers runtime |

## Documentation

- [docs/plan.md](docs/plan.md): what we are building, the architecture, who builds what, and the schedule
- [docs/setup.md](docs/setup.md): keys, services, tests and coding-agent tooling
- [AGENTS.md](AGENTS.md): rules for coding agents working in this repository

## Credits

Majnu started from [ysskrishna/nextjs-supabase-starter](https://github.com/ysskrishna/nextjs-supabase-starter) by Y. Siva Sai Krishna, released under the MIT License. It gave us working authentication, route protection and the UI component set on day one, which let us spend the hackathon on the product itself. Thank you. The original license notice is kept in [LICENSE](LICENSE).
