import { createHmac } from "node:crypto"
import { describe, expect, it } from "vitest"
import { clientIp, visitorId } from "@/lib/open/visitor"

const base = {
  letterId: "11111111-1111-4111-8111-111111111111",
  ip: "203.0.113.7",
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
  secret: "test-secret",
}

describe("visitorId", () => {
  it("is a stable 64-character hex string", async () => {
    const a = await visitorId(base)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(await visitorId({ ...base })).toBe(a)
  })

  it("is an HMAC-SHA-256 of the letter, IP and user agent under the secret", async () => {
    const expected = createHmac("sha256", base.secret)
      .update(JSON.stringify([base.letterId, base.ip, base.userAgent]))
      .digest("hex")
    expect(await visitorId(base)).toBe(expected)
  })

  it("differs by letter, so one visitor cannot be followed across letters", async () => {
    const other = await visitorId({ ...base, letterId: "22222222-2222-4222-8222-222222222222" })
    expect(other).not.toBe(await visitorId(base))
  })

  it("differs by user agent and by secret", async () => {
    const a = await visitorId(base)
    expect(await visitorId({ ...base, userAgent: "curl/8.0" })).not.toBe(a)
    expect(await visitorId({ ...base, secret: "another-secret" })).not.toBe(a)
  })

  it("does not contain the IP address", async () => {
    const id = await visitorId(base)
    expect(id).not.toContain(base.ip)
    expect(id).not.toContain(base.ip.replaceAll(".", ""))
    expect(id).not.toContain(Buffer.from(base.ip).toString("hex"))
  })

  it("refuses to hash without a secret", async () => {
    await expect(visitorId({ ...base, secret: "" })).rejects.toThrow(/OPEN_HASH_SECRET/)
  })
})

describe("clientIp", () => {
  it("prefers Cloudflare's connecting IP", () => {
    const headers = new Headers({ "cf-connecting-ip": "198.51.100.1", "x-forwarded-for": "203.0.113.9" })
    expect(clientIp(headers)).toBe("198.51.100.1")
  })

  it("falls back to the first X-Forwarded-For entry", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": " 203.0.113.9 , 10.0.0.1" }))).toBe("203.0.113.9")
  })

  it("is empty when neither header is present", () => {
    expect(clientIp(new Headers())).toBe("")
  })
})
