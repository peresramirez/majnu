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
| [guest-accounts.md](guest-accounts.md) | Guest (anonymous) accounts, upgrading them with email or Google, the Turnstile bot check on sign-in, and the four app tabs |
