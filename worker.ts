// The Worker's entry point (wrangler.jsonc "main"). It serves the app with the
// fetch handler OpenNext generates, and adds the queue consumer that makes
// personalised wrappers (lib/billing/consumer.ts,
// docs/features/daytona-redesign.md).
//
// One Worker, one deploy: `npm run deploy` builds .open-next/worker.js and
// wrangler bundles this file around it. The design job takes about 90 seconds,
// far longer than a request should; a queue consumer may run for 15 minutes of
// wall time per message, and waiting on Daytona and Anthropic is I/O, not CPU
// time. Only the default export is allowed here: the runtime reads every
// export of the entry module as a possible entrypoint.

// @ts-ignore .open-next/worker.js is generated at build time by `opennextjs-cloudflare build`.
import { default as handler } from "./.open-next/worker.js"
import { consumeDesignBatch, type MessageBatch } from "./lib/billing/consumer"

export default {
  fetch: handler.fetch,
  async queue(batch: MessageBatch): Promise<void> {
    await consumeDesignBatch(batch)
  },
}
