import { describe, expect, it } from "vitest"
import { populateQueueEnv } from "@/lib/billing/queue-env"

describe("populateQueueEnv", () => {
  it("copies the Worker's string variables and secrets, skipping bindings", () => {
    const target: Record<string, string | undefined> = {}
    const queueBinding = { send: () => undefined }
    populateQueueEnv(target, { SUPABASE_SERVICE_ROLE_KEY: "service", DESIGN_QUEUE: queueBinding, MAJNU_MODEL: "m" }, {})
    expect(target).toEqual({ SUPABASE_SERVICE_ROLE_KEY: "service", MAJNU_MODEL: "m" })
  })

  it("fills the build's public values for production without overriding the Worker's", () => {
    const target: Record<string, string | undefined> = {}
    populateQueueEnv(
      target,
      { NEXT_PUBLIC_SITE_URL: "https://majnu.app" },
      { production: { NEXT_PUBLIC_SUPABASE_URL: "https://ref.supabase.co", NEXT_PUBLIC_SITE_URL: "http://localhost:3000" } },
    )
    expect(target.NEXT_PUBLIC_SUPABASE_URL).toBe("https://ref.supabase.co")
    expect(target.NEXT_PUBLIC_SITE_URL).toBe("https://majnu.app")
  })

  it("keeps values that are already set and uses NEXTJS_ENV to pick the build's values", () => {
    const target: Record<string, string | undefined> = { ALREADY: "kept" }
    populateQueueEnv(target, { NEXTJS_ENV: "test" }, { production: { A: "prod", ALREADY: "no" }, test: { A: "test" } })
    expect(target.A).toBe("test")
    expect(target.ALREADY).toBe("kept")
  })
})
