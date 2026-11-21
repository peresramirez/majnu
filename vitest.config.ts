import { fileURLToPath } from "node:url"
import { loadEnv } from "vite"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // Loads .env and .env.local so tests see the same keys as `next dev`.
    env: loadEnv("", process.cwd(), ""),
    testTimeout: 20_000,
  },
})
