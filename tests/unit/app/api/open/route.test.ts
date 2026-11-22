import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "@/app/api/open/route"

const fakes = vi.hoisted(() => ({ recordOpenEvent: vi.fn(), cf: undefined as Record<string, unknown> | undefined }))
vi.mock("@/lib/open/record", () => ({ recordOpenEvent: fakes.recordOpenEvent }))
// Outside Workers getCloudflareContext() throws; on Workers it carries request.cf.
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => {
    if (!fakes.cf) throw new Error("not on Workers")
    return { cf: fakes.cf, env: {}, ctx: {} }
  },
}))

function post(body: string, headers: Record<string, string> = {}) {
  return POST(new Request("https://majnu.app/api/open", { method: "POST", body, headers }))
}

beforeEach(() => {
  fakes.recordOpenEvent.mockReset().mockResolvedValue(undefined)
  fakes.cf = undefined
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
      details: { country: null, city: null, language: null, device: "desktop" },
    })
  })

  it("passes the place, language and device, and keeps the IP address out of them", async () => {
    const res = await post(JSON.stringify({ slug: "Kp7dRw3xYq", type: "open" }), {
      "cf-connecting-ip": "203.0.113.7",
      "cf-ipcountry": "AT",
      "accept-language": "de-AT,de;q=0.9,en;q=0.5",
      "user-agent":
        "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
    })
    expect(res.status).toBe(204)
    const call = fakes.recordOpenEvent.mock.calls[0][0]
    expect(call.details).toEqual({ country: "AT", city: null, language: "de", device: "phone" })
    expect(JSON.stringify(call.details)).not.toContain("203.0.113.7")

    fakes.cf = { country: "AT", city: "Wien", latitude: "48.2", longitude: "16.4" }
    await post(JSON.stringify({ slug: "Kp7dRw3xYq", type: "open" }), { "accept-language": "de-AT" })
    expect(fakes.recordOpenEvent.mock.calls[1][0].details).toEqual({ country: "AT", city: "Wien", language: "de", device: null })
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
