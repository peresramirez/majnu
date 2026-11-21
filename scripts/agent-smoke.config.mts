// Config for the manual agent check (scripts/agent-smoke.test.ts). It calls the
// real model and costs a few cents, so it is not part of `npm test` or
// `npm run test:smoke`. Run it with:
//   npx vitest run --config scripts/agent-smoke.config.mts
import { fileURLToPath } from "node:url"
import { loadEnv } from "vite"
import { defineConfig } from "vitest/config"

const root = fileURLToPath(new URL("../", import.meta.url))

export default defineConfig({
  root,
  resolve: {
    alias: {
      "@": root,
      // Server modules import "server-only", which throws outside a React server bundle.
      "server-only": fileURLToPath(new URL("../node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["scripts/agent-smoke.test.ts"],
    env: { ...loadEnv("production", root, ""), ...loadEnv("", root, "") },
    testTimeout: 300_000,
    fileParallelism: false,
  },
})
