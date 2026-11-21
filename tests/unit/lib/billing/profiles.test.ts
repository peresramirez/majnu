// The profiles writes: billing columns are written with the service-role
// client only, and a stored Stripe customer is never replaced.
import { beforeEach, describe, expect, it, vi } from "vitest"

const fakes = vi.hoisted(() => {
  // A chainable query: every builder method returns the query itself, and
  // awaiting it yields the next queued result. Calls are recorded.
  function client(results: unknown[], calls: unknown[][]) {
    const query: object = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "then") return (resolve: (value: unknown) => void) => resolve(results.shift())
          return (...args: unknown[]) => {
            calls.push([prop, ...args])
            return query
          }
        },
      },
    )
    return { from: (table: string) => (calls.push(["from", table]), query) }
  }
  return { client, adminClient: vi.fn(), serverClient: vi.fn() }
})

vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: fakes.adminClient }))
vi.mock("@/lib/supabase/server", () => ({ createClient: fakes.serverClient }))

import { getMyBillingProfile, saveCustomerId, savePlanState } from "@/lib/billing/profiles"

let calls: unknown[][]

beforeEach(() => {
  calls = []
  fakes.adminClient.mockReset()
  fakes.serverClient.mockReset().mockImplementation(() => {
    throw new Error("billing writes must not use the user's client")
  })
})

describe("saveCustomerId", () => {
  it("only fills an empty stripe_customer_id", async () => {
    fakes.adminClient.mockReturnValue(fakes.client([{ data: [{ user_id: "u1" }], error: null }], calls))
    expect(await saveCustomerId("u1", "cus_new")).toBe("cus_new")
    expect(calls).toContainEqual(["update", { stripe_customer_id: "cus_new" }])
    expect(calls).toContainEqual(["eq", "user_id", "u1"])
    expect(calls).toContainEqual(["is", "stripe_customer_id", null])
  })

  it("keeps the customer already on file when another request stored one first", async () => {
    fakes.adminClient.mockReturnValue(
      fakes.client(
        [
          { data: [], error: null },
          {
            data: {
              user_id: "u1",
              plan: "free",
              stripe_customer_id: "cus_first",
              stripe_subscription_id: null,
              plan_renews_at: null,
              plan_cancel_at: null,
            },
            error: null,
          },
        ],
        calls,
      ),
    )
    expect(await saveCustomerId("u1", "cus_second")).toBe("cus_first")
    expect(calls.some((c) => c[0] === "insert")).toBe(false)
  })
})

describe("savePlanState", () => {
  it("writes the plan, subscription and dates for that user with the admin client", async () => {
    fakes.adminClient.mockReturnValue(fakes.client([{ error: null }], calls))
    await savePlanState("u1", {
      plan: "full-moon",
      subscriptionId: "sub_1",
      renewsAt: "2026-12-21T00:00:00.000Z",
      cancelAt: null,
    })
    expect(calls).toContainEqual(["from", "profiles"])
    expect(calls).toContainEqual([
      "upsert",
      {
        user_id: "u1",
        plan: "full-moon",
        stripe_subscription_id: "sub_1",
        plan_renews_at: "2026-12-21T00:00:00.000Z",
        plan_cancel_at: null,
      },
      { onConflict: "user_id" },
    ])
  })

  it("throws when the database refuses, so Stripe retries the webhook", async () => {
    fakes.adminClient.mockReturnValue(fakes.client([{ error: { message: "boom" } }], calls))
    await expect(
      savePlanState("u1", { plan: "free", subscriptionId: "sub_1", renewsAt: null, cancelAt: null }),
    ).rejects.toThrow(/boom/)
  })
})

describe("getMyBillingProfile", () => {
  it("reads through the user's own client and copes without plan_cancel_at", async () => {
    fakes.serverClient.mockReset().mockResolvedValue(
      fakes.client(
        [
          {
            data: {
              user_id: "u1",
              plan: "full-moon",
              stripe_customer_id: "cus_1",
              stripe_subscription_id: "sub_1",
              plan_renews_at: "2026-12-21T00:00:00.000Z",
            },
            error: null,
          },
        ],
        calls,
      ),
    )
    expect(await getMyBillingProfile()).toMatchObject({ plan: "full-moon", planCancelAt: null, stripeSubscriptionId: "sub_1" })
    expect(fakes.adminClient).not.toHaveBeenCalled()
  })
})
