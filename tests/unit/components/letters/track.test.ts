import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { EVENT_ENDPOINT, eventBody, makeTracker, reportOpen, sendLetterEventOnce } from "@/components/letters/track"

// The helpers run in the browser; give them just enough of one.
const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })))

beforeEach(() => {
  fetchMock.mockClear()
  vi.stubGlobal("window", {})
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

function sentBodies() {
  return fetchMock.mock.calls.map((call) => {
    const [url, init] = call as unknown as [string, RequestInit]
    expect(url).toBe(EVENT_ENDPOINT)
    expect(init.method).toBe("POST")
    expect(init.keepalive).toBe(true)
    return JSON.parse(String(init.body))
  })
}

describe("eventBody", () => {
  it("includes the day only when it is a door number", () => {
    expect(eventBody("abc", "open")).toEqual({ slug: "abc", type: "open" })
    expect(eventBody("abc", "door_open", 3)).toEqual({ slug: "abc", type: "door_open", day: 3 })
    expect(eventBody("abc", "gift_click", 0)).toEqual({ slug: "abc", type: "gift_click" })
  })
})

describe("owner preview", () => {
  it("never sends an open", () => {
    reportOpen("owner-1", true)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it("never sends door or gift events", () => {
    const track = makeTracker("owner-2", true)
    track("door_open", 1)
    track("gift_click")
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("recipient", () => {
  it("sends one open per page load", () => {
    reportOpen("visit-1", false)
    reportOpen("visit-1", false)
    expect(sentBodies()).toEqual([{ slug: "visit-1", type: "open" }])
  })
  it("sends each door once and gifts with their door", () => {
    const track = makeTracker("visit-2", false)
    track("door_open", 2)
    track("door_open", 2)
    track("door_open", 3)
    track("gift_click", 3)
    expect(sentBodies()).toEqual([
      { slug: "visit-2", type: "door_open", day: 2 },
      { slug: "visit-2", type: "door_open", day: 3 },
      { slug: "visit-2", type: "gift_click", day: 3 },
    ])
  })
  it("sends only the slug, type and day: no visitor id or stored state", () => {
    sendLetterEventOnce(eventBody("visit-3", "open"))
    const [body] = sentBodies()
    expect(Object.keys(body).sort()).toEqual(["slug", "type"])
  })
  it("ignores a failing request", async () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error("offline")))
    expect(() => reportOpen("visit-4", false)).not.toThrow()
    await Promise.resolve()
  })
})
