// GET /l/<slug>/design (app/(public)/l/[slug]/design/route.ts). Kept beside the
// other Daytona tests rather than under tests/unit/app/, which belongs to the
// public pages.
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const fakes = vi.hoisted(() => ({ getLatestDesign: vi.fn() }))
vi.mock("@/lib/daytona/designs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/daytona/designs")>()),
  getLatestDesign: fakes.getLatestDesign,
}))

import { GET } from "@/app/(public)/l/[slug]/design/route"
import { DESIGN_CSP } from "@/lib/daytona/designs"

const PAGE = "<!doctype html><html><body><p>For Lucia</p></body></html>"

function get(slug: string) {
  return GET(new Request(`https://majnu.app/l/${slug}/design`), { params: Promise.resolve({ slug }) })
}

beforeEach(() => {
  fakes.getLatestDesign.mockReset()
})

describe("GET /l/[slug]/design", () => {
  it("serves the newest design with the sandboxing headers", async () => {
    fakes.getLatestDesign.mockResolvedValue({ id: "d1", html: PAGE, createdAt: "2026-11-21T20:00:00Z" })
    const res = await get("wJCg3TjW7x")
    expect(res.status).toBe(200)
    expect(await res.text()).toBe(PAGE)
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8")
    expect(res.headers.get("content-security-policy")).toBe(DESIGN_CSP)
    expect(res.headers.get("x-content-type-options")).toBe("nosniff")
    expect(res.headers.get("referrer-policy")).toBe("no-referrer")
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow")
    expect(res.headers.get("cache-control")).toBe("private, no-store")
    expect(res.headers.get("set-cookie")).toBeNull()
    expect(fakes.getLatestDesign).toHaveBeenCalledWith("wJCg3TjW7x")
  })

  it("answers 404 in plain text when the letter has no design", async () => {
    fakes.getLatestDesign.mockResolvedValue(null)
    const res = await get("wJCg3TjW7x")
    expect(res.status).toBe(404)
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8")
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow")
  })

  it("answers 404 without a lookup for a slug that cannot exist", async () => {
    const res = await get("..%2Fetc")
    expect(res.status).toBe(404)
    expect(fakes.getLatestDesign).not.toHaveBeenCalled()
  })

  it("answers 500 without details when the lookup fails", async () => {
    fakes.getLatestDesign.mockRejectedValue(new Error("connection refused to db.internal"))
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const res = await get("wJCg3TjW7x")
    expect(res.status).toBe(500)
    expect(await res.text()).toBe("Something went wrong")
    error.mockRestore()
  })
})
