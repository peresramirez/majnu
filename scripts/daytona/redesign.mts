// Runs one redesign by hand, with the keys in .env.local:
//
//   node scripts/daytona/redesign.mts <letterId> "<what the sender asked for>"
//
// It starts a Daytona sandbox, runs Claude Code in it for up to about six
// minutes, stores the page in letter_designs and deletes the sandbox, so it
// spends Daytona and Anthropic credit. The page is then at /l/<slug>/design.
//
// The job itself is lib/daytona/redesign.ts. This script loads it through
// Vite's module runner, so the app's "@/..." imports resolve and the
// "server-only" guard is satisfied without a Next.js server.
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { runnerImport } from "vite"

const root = fileURLToPath(new URL("../../", import.meta.url))
if (existsSync(`${root}.env.local`)) process.loadEnvFile(`${root}.env.local`)

const [letterId, request] = process.argv.slice(2)
if (!letterId || !request) {
  console.error('Usage: node scripts/daytona/redesign.mts <letterId> "<design request>"')
  process.exit(2)
}

type Job = typeof import("../../lib/daytona/redesign.ts")

const { module: job } = await runnerImport<Job>(`${root}lib/daytona/redesign.ts`, {
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

try {
  const result = await job.redesignLetter(letterId, request)
  console.log(JSON.stringify(result, null, 2))
  if (!result.sandboxDeleted) {
    console.error(`Sandbox ${result.sandboxId} could not be deleted: check the Daytona dashboard.`)
    process.exit(1)
  }
} catch (error) {
  console.error(`Redesign failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
