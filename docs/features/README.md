# Feature architecture

One page per feature, written by whoever builds the feature and updated whenever it changes. Together with [../architecture.md](../architecture.md) they explain how Majnu works, deep enough to present.

Every page follows the same outline:

1. **What it does**, in two or three sentences from the user's side.
2. **How it works**: a mermaid diagram of the moving parts (browser, routes, agents, services, tables), then the steps of one request in order.
3. **Pieces**: the files, routes, database tables and environment variables involved, each with one line on its job.
4. **Data and privacy**: what is stored, for how long, who can read it, and what never leaves the server.
5. **Limits and costs**: caps, quotas and what one use costs.
6. **How it was checked**: tests, live checks and what is still unverified.
7. **Open questions**: known gaps and follow-ups.

| Page | Feature |
|---|---|
| [gift-finder-ui.md](gift-finder-ui.md) | The gift finder on the landing page: the compact hero (headline, Majnu's greeting, one-line message box), the finder dialog with three gifts and personalising questions, invisible anonymous sign-in, wrapping the chosen gift into a page with its link, and the preview dialog for example and finished gifts (issue #32) |
| [gift-finder-api.md](gift-finder-api.md) | The gift finder's server side: the finder agent with its context, research in the visitor's language and country with product photos, personalising, the daily and site-wide search limits, and wrapping the chosen gift into a page (issue #31) |
| [letters-chat.md](letters-chat.md) | The main agent, the builder and research sub-agents, `POST /api/chat` and its NDJSON events, stored history, model settings |
| [templates-and-gift-pages.md](templates-and-gift-pages.md) | The letter contract, the seven templates, `/l/[slug]`, door locking, the link-preview image, demo slugs, the template workbench |
| [sharing-and-tracking.md](sharing-and-tracking.md) | The share panel and QR code, the open beacon, the visitor hash, the statistics and My gifts |
| [billing.md](billing.md) | Crescent and Full moon, the Stripe subscription, return page, webhook and portal, the `MAJNU_BILLING` switch |
| [daytona-redesign.md](daytona-redesign.md) | One-off designs made by Claude Code in a Daytona sandbox: snapshot, job, page checker, serving, costs |
| [data-and-security.md](data-and-security.md) | Schema and migrations, row-level security, server-only writes, the spending guard, secrets, deploying |
| [landing-and-brand.md](landing-and-brand.md) | The landing page and its scroll scene, the Night Post brand, the legal pages |
| [agent-workflow.md](agent-workflow.md) | How the repository is built: a lead session, parallel task sessions, CI before merge |
| [guest-accounts.md](guest-accounts.md) | Guest (anonymous) accounts, upgrading them with email or Google, the Turnstile bot check on sign-in, and the four app tabs |
| [voice-input.md](voice-input.md) | Voice input: the microphone button in the finder and the Letters & invitations chat, `POST /api/transcribe` with OpenAI's `gpt-transcribe`, and the daily limits in `voice_transcriptions` (issue #37) |
| [gift-list.md](gift-list.md) | Gift lists on wedding and birthday invitations: Majnu researches and adds gifts, guests claim one each with `POST /api/claim` (no account, one claim per gift, a per-visitor limit), and the host sees who is bringing what on My gifts and can release a claim (issue #35) |
