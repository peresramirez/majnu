import { beforeEach, describe, expect, it, vi } from "vitest"
import { GET, POST } from "@/app/api/claim/route"

const fakes = vi.hoisted(() => ({ claimGift: vi.fn(), getClaimedItemIds: vi.fn() }))
vi.mock("@/lib/claims/claim", () => ({ claimGift: fakes.claimGift, getClaimedItemIds: fakes.getClaimedItemIds }))

function post(body: string, headers: Record<string, string> = {}) {
  return POST(new Request("https://majnu.app/api/claim", { method: "POST", body, headers }))
}

const valid = { slug: "Kp7dRw3xYq", itemId: "fxpty01" }

beforeEach(() => {
  fakes.claimGift.mockReset().mockResolvedValue({ status: "claimed", claimed: ["fxpty01"] })
  fakes.getClaimedItemIds.mockReset().mockResolvedValue([])
})

describe("POST /api/claim", () => {
  it("claims a gift with the cleaned name, the IP address and the browser, and answers JSON", async () => {
    const res = await post(JSON.stringify({ ...valid, name: "  Sam  " }), {
      "content-type": "application/json",
      "cf-connecting-ip": "203.0.113.7",
      "user-agent": "Mozilla/5.0 Test",
      "sec-fetch-site": "same-origin",
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, claimed: ["fxpty01"] })
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(res.headers.get("set-cookie")).toBeNull()
    expect(fakes.claimGift).toHaveBeenCalledWith({
      slug: "Kp7dRw3xYq",
      itemId: "fxpty01",
      guestName: "Sam",
      ip: "203.0.113.7",
      userAgent: "Mozilla/5.0 Test",
    })
  })

  it("passes no name when the guest left none", async () => {
    await post(JSON.stringify({ ...valid, name: "   " }))
    expect(fakes.claimGift.mock.calls[0][0].guestName).toBeNull()
  })

  it.each([
    [{ status: "taken", claimed: ["fxpty01"] }, 409, { ok: false, error: "taken", claimed: ["fxpty01"] }],
    [{ status: "item_not_found", claimed: [] }, 404, { ok: false, error: "item_not_found", claimed: [] }],
    [{ status: "too_many", claimed: ["a", "b", "c"] }, 429, { ok: false, error: "too_many", claimed: ["a", "b", "c"] }],
    [{ status: "not_found" }, 404, { ok: false, error: "not_found" }],
    [{ status: "unavailable" }, 503, { ok: false, error: "unavailable" }],
  ])("answers %o with %i", async (result, status, body) => {
    fakes.claimGift.mockResolvedValue(result)
    const res = await post(JSON.stringify(valid))
    expect(res.status).toBe(status)
    expect(await res.json()).toEqual(body)
  })

  it("refuses bodies that are not a valid claim", async () => {
    for (const body of ["not json", JSON.stringify({ slug: "Kp7dRw3xYq" }), JSON.stringify({ ...valid, itemId: "a b" }), JSON.stringify([valid])]) {
      const res = await post(body)
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ ok: false, error: "invalid_request" })
    }
    expect(fakes.claimGift).not.toHaveBeenCalled()
  })

  it("refuses large bodies and claims sent from another site", async () => {
    expect((await post(JSON.stringify({ ...valid, name: "x".repeat(2000) }))).status).toBe(413)
    const crossSite = await post(JSON.stringify(valid), { "sec-fetch-site": "cross-site" })
    expect(crossSite.status).toBe(403)
    expect(fakes.claimGift).not.toHaveBeenCalled()
  })

  it("answers 500 when the database fails", async () => {
    fakes.claimGift.mockRejectedValue(new Error("database down"))
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const res = await post(JSON.stringify(valid))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ ok: false, error: "server_error" })
    error.mockRestore()
  })
})

describe("GET /api/claim", () => {
  it("lists the claimed gift ids for a slug", async () => {
    fakes.getClaimedItemIds.mockResolvedValue(["fxpty02"])
    const res = await GET(new Request("https://majnu.app/api/claim?slug=Kp7dRw3xYq"))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ claimed: ["fxpty02"] })
    expect(fakes.getClaimedItemIds).toHaveBeenCalledWith("Kp7dRw3xYq")
  })

  it("answers an empty list for a slug that cannot exist, without a lookup", async () => {
    const res = await GET(new Request("https://majnu.app/api/claim?slug=../etc"))
    expect(await res.json()).toEqual({ claimed: [] })
    expect(fakes.getClaimedItemIds).not.toHaveBeenCalled()
  })
})
