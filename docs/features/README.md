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
| [gift-finder-ui.md](gift-finder-ui.md) | The gift finder on the landing page: Majnu's greeting and message box in the hero, the finder dialog with three gifts and personalising questions, invisible anonymous sign-in, and wrapping the chosen gift into a page with its link (issue #32) |
| [gift-finder-api.md](gift-finder-api.md) | The gift finder's server side: the finder agent with its context, research in the visitor's language and country with product photos, personalising, the daily and site-wide search limits, and wrapping the chosen gift into a page (issue #31) |
