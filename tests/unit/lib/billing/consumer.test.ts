// The Worker's queue consumer: which job each queue runs, and when a message
// is acknowledged or handed on to the dead-letter queue.
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/billing/fulfil", () => ({ runPurchaseDesign: vi.fn(), refundAbandonedPurchase: vi.fn() }))

import { DESIGN_DEAD_LETTER_QUEUE, DESIGN_QUEUE, consumeDesignBatch, purchaseIdOf } from "@/lib/billing/consumer"

const ID = "7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f"

function message(body: unknown) {
  return { id: "m1", body, attempts: 1, ack: vi.fn(), retry: vi.fn() }
}

describe("consumeDesignBatch", () => {
  it("runs the design for a message on the design queue and acknowledges it", async () => {
    const run = vi.fn(async () => ({ outcome: "done" as const, designId: "d1", seconds: 80 }))
    const refund = vi.fn()
    const m = message({ purchaseId: ID })
    await consumeDesignBatch({ queue: DESIGN_QUEUE, messages: [m] }, { run, refund })
    expect(run).toHaveBeenCalledWith(ID)
    expect(refund).not.toHaveBeenCalled()
    expect(m.ack).toHaveBeenCalled()
    expect(m.retry).not.toHaveBeenCalled()
  })

  it("acknowledges a refunded run too: a retry would be another paid run", async () => {
    const m = message({ purchaseId: ID })
    await consumeDesignBatch({ queue: DESIGN_QUEUE, messages: [m] }, { run: async () => ({ outcome: "refunded", reason: "x" }), refund: vi.fn() })
    expect(m.ack).toHaveBeenCalled()
  })

  it("refunds a message that reached the dead-letter queue", async () => {
    const run = vi.fn()
    const refund = vi.fn(async () => ({ outcome: "refunded" as const, reason: "stopped" }))
    const m = message({ purchaseId: ID })
    await consumeDesignBatch({ queue: DESIGN_DEAD_LETTER_QUEUE, messages: [m] }, { run, refund })
    expect(refund).toHaveBeenCalledWith(ID)
    expect(run).not.toHaveBeenCalled()
    expect(m.ack).toHaveBeenCalled()
  })

  it("hands a message whose job threw to the dead-letter queue", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const m = message({ purchaseId: ID })
    await consumeDesignBatch({ queue: DESIGN_QUEUE, messages: [m] }, { run: async () => Promise.reject(new Error("database down")), refund: vi.fn() })
    expect(m.retry).toHaveBeenCalled()
    expect(m.ack).not.toHaveBeenCalled()
  })

  it("drops a malformed message without running anything", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const run = vi.fn()
    const m = message({ purchaseId: "../../etc" })
    await consumeDesignBatch({ queue: DESIGN_QUEUE, messages: [m] }, { run, refund: vi.fn() })
    expect(run).not.toHaveBeenCalled()
    expect(m.ack).toHaveBeenCalled()
  })
})

describe("purchaseIdOf", () => {
  it("accepts only a purchase id", () => {
    expect(purchaseIdOf({ purchaseId: ID })).toBe(ID)
    expect(purchaseIdOf({ purchaseId: 1 })).toBeNull()
    expect(purchaseIdOf("x")).toBeNull()
    expect(purchaseIdOf(null)).toBeNull()
  })
})
