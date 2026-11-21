import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "@/app/api/open/route"

const fakes = vi.hoisted(() => ({ recordOpenEvent: vi.fn() }))
vi.mock("@/lib/open/record", () => ({ recordOpenEvent: fakes.recordOpenEvent }))

function post(body: string, headers: Record<string, string> = {}) {
  return POST(new Request("https://majnu.app/api/open", { method: "POST", body, headers }))
}

beforeEach(() => {
  fakes.recordOpenEvent.mockReset().mockResolvedValue(undefined)
})

describe("POST /api/open", () => {
  it("records a valid event and answers 204 with no body and no cookies", async () => {
    const res = await post(JSON.stringify({ slug: "Kp7dRw3xYq", type: "door_open", day: 2 }), {
      "content-type": "text/plain;charset=UTF-8", // what navigator.sendBeacon sends for a string
      "cf-connecting-ip": "203.0.113.7",
      "user-agent": "Mozilla/5.0 Test",
    })
    expect(res.status).toBe(204)
    expect(await res.text()).toBe("")
    expect(res.headers.get("set-cookie")).toBeNull()
    expect(fakes.recordOpenEvent).toHaveBeenCalledWith({
      slug: "Kp7dRw3xYq",
      type: "door_open",
      day: 2,
      ip: "203.0.113.7",
      userAgent: "Mozilla/5.0 Test",
    })
  })

  it("answers 204 even when recording fails, so the letter page never breaks", async () => {
    fakes.recordOpenEvent.mockRejectedValue(new Error("database down"))
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const res = await post(JSON.stringify({ slug: "Kp7dRw3xYq", type: "open" }))
    expect(res.status).toBe(204)
    error.mockRestore()
  })

  it("rejects malformed bodies without recording", async () => {
    expect((await post("not json")).status).toBe(400)
    expect((await post(JSON.stringify({ slug: "Kp7dRw3xYq", type: "view" }))).status).toBe(400)
    expect((await post(JSON.stringify({ slug: "Kp7dRw3xYq", type: "open", day: 1.5 }))).status).toBe(400)
    expect((await post(JSON.stringify({ slug: "x".repeat(2000), type: "open" }))).status).toBe(413)
    expect(fakes.recordOpenEvent).not.toHaveBeenCalled()
  })
})
