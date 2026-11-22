import { fileURLToPath } from "node:url"
import { loadEnv } from "vite"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  // tsconfig.json keeps JSX as written (`"jsx": "preserve"`) for Next.js to
  // compile; tests that render a component need it turned into React calls.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // Public values from .env.production, then .env.local on top, so tests
    // see the same keys as `next dev` locally and still run in CI, where
    // there is no .env.local and secrets arrive as environment variables.
    env: { ...loadEnv("production", process.cwd(), ""), ...loadEnv("", process.cwd(), "") },
    testTimeout: 20_000,
  },
})
