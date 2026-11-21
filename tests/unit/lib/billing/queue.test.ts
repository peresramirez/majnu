// Handing a paid purchase to the design job: the Cloudflare Queue on Workers,
// the background of the dev server locally, and nothing (a script run) elsewhere.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const context = vi.hoisted(() => ({ env: null as Record<string, unknown> | null }))
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => {
    if (!context.env) throw new Error("not running on Workers")
    return { env: context.env }
  },
}))
const runPurchaseDesign = vi.hoisted(() => vi.fn(async () => ({ outcome: "done" })))
vi.mock("@/lib/billing/fulfil", () => ({ runPurchaseDesign }))

import { enqueueDesign } from "@/lib/billing/queue"

const ID = "7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f"

beforeEach(() => {
  context.env = null
  runPurchaseDesign.mockClear()
})
afterEach(() => vi.unstubAllEnvs())

describe("enqueueDesign", () => {
  it("sends the purchase to the design queue on Workers", async () => {
    const send = vi.fn(async () => undefined)
    context.env = { DESIGN_QUEUE: { send } }
    expect(await enqueueDesign(ID)).toBe("queued")
    expect(send).toHaveBeenCalledWith({ purchaseId: ID }, { contentType: "json" })
    expect(runPurchaseDesign).not.toHaveBeenCalled()
  })

  it("runs the job in the background of the dev server when there is no queue", async () => {
    vi.stubEnv("NODE_ENV", "development")
    expect(await enqueueDesign(ID)).toBe("inline")
    await vi.waitFor(() => expect(runPurchaseDesign).toHaveBeenCalledWith(ID))
  })

  it("leaves the purchase paid, for a run by script, anywhere else", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    context.env = {}
    expect(await enqueueDesign(ID)).toBe("not_queued")
    expect(runPurchaseDesign).not.toHaveBeenCalled()
  })

  it("lets a failed send throw, so the webhook answers 500 and Stripe retries", async () => {
    context.env = { DESIGN_QUEUE: { send: async () => Promise.reject(new Error("queue unavailable")) } }
    await expect(enqueueDesign(ID)).rejects.toThrow("queue unavailable")
  })
})
