// Runs the design job for one paid purchase by hand, with the keys in
// .env.local: the fallback when the queue is not running (docs/features/
// daytona-redesign.md, "Running it").
//
//   node scripts/daytona/run-purchase.mts <purchaseId>
//
// It does exactly what the queue consumer does: claims the purchase (paid →
// designing), runs the redesign in a Daytona sandbox (about 90 seconds, spends
// Daytona and Anthropic credit), and marks it done, or refunds it through
// Stripe if the run fails. A purchase that is not paid is left alone.
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { runnerImport } from "vite"

const root = fileURLToPath(new URL("../../", import.meta.url))
if (existsSync(`${root}.env.local`)) process.loadEnvFile(`${root}.env.local`)

const [purchaseId] = process.argv.slice(2)
if (!purchaseId) {
  console.error("Usage: node scripts/daytona/run-purchase.mts <purchaseId>")
  process.exit(2)
}

type Job = typeof import("../../lib/billing/fulfil.ts")

const { module: job } = await runnerImport<Job>(`${root}lib/billing/fulfil.ts`, {
  configFile: false,
  root,
  logLevel: "error",
  resolve: {
    alias: {
      "@": root.replace(/\/$/, ""),
      "server-only": `${root}node_modules/server-only/empty.js`,
    },
  },
})

const result = await job.runPurchaseDesign(purchaseId)
console.log(JSON.stringify(result, null, 2))
process.exit(result.outcome === "done" ? 0 : 1)
