import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { ProfileReadError } from "@/lib/social/apify"
import {
  BRIGHTDATA_DATASETS,
  brightDataInstagramText,
  CANCEL_TIMEOUT_MS,
  linkedinProfileUrl,
  linkedinText,
  POLL_INTERVAL_MS,
  readInstagramWithBrightData,
  readLinkedInProfile,
} from "@/lib/social/brightdata"

// Made-up people and accounts: never anyone real.
const KEY = "brightdata_test_key"

const LINKEDIN_RECORD = {
  id: "lena-example-1a2b3c",
  name: "Lena Example",
  city: "Hamburg, Germany",
  country_code: "DE",
  avatar: "https://media.example-cdn.com/lena.jpg",
  position: "Product designer at Example Bikes · trail runner",
  about: "I design cargo bikes and spend weekends on trails. Reach me at lena@example.de or https://lena.example.de #cargobike",
  current_company: { name: "Example Bikes", title: "Product designer", company_id: "example-bikes", link: "https://www.linkedin.com/company/example-bikes" },
  experience: [
    { title: "Product designer", company: "Example Bikes", location: "Hamburg", description: "Frames and racks" },
    { title: "UX intern", company: "Studio Sample", company_logo_url: "https://media.example-cdn.com/logo.png" },
    "not an object",
  ],
  education: [{ title: "Example University of the Arts", start_year: "2012", institute_logo_url: "https://media.example-cdn.com/uni.png" }],
  posts: [
    { title: "Our new cargo bike is out #cargobike #design", attribution: "After two years of work…", link: "https://www.linkedin.com/pulse/x" },
    { title: "Ten kilometres of mud this morning #trailrunning", link: "https://www.linkedin.com/posts/y" },
  ],
  activity: [
    { interaction: "Lena Example shared this", title: "Why film photography is back #filmphotography", img: "https://media.example-cdn.com/a.jpg" },
    { interaction: "Lena Example liked this", title: "Five sales funnels that convert" },
    { interaction: "Lena Example commented on a post 3d", title: "Max Muster: my promotion news" },
    { interaction: "", title: "An unlabelled item" },
  ],
  people_also_viewed: [{ name: "Max Muster", profile_link: "https://www.linkedin.com/in/max-muster" }],
  similar_profiles: [{ name: "Erika Beispiel", url: "https://www.linkedin.com/in/erika-beispiel" }],
}

const INSTAGRAM_RECORD = {
  account: "example.climbs",
  is_private: false,
  full_name: "Anna Example",
  biography: "Climbing and coffee ☕ write to hello@example.com",
  email_address: "hello@example.com",
  business_email: "work@example.com",
  phone_number: "+49 170 1234567",
  followers: 1200,
  related_accounts: [{ user_name: "someone.else" }],
  profile_image_link: "https://media.example-cdn.com/anna.jpg",
  posts: [
    { caption: "Bouldering at dawn with @friend.climbs #climbing https://example.com/x", post_hashtags: ["climbing", "Boulder,"], image_url: "https://media.example-cdn.com/p1.jpg" },
    { caption: "Morning espresso", post_hashtags: null, image_url: "https://media.example-cdn.com/p2.jpg" },
  ],
  post_hashtags: ["climbing", "Boulder,"],
}

type Reply = { status?: number; body?: unknown; text?: string }

function reply({ status = 200, body, text }: Reply): Response {
  return new Response(text ?? JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

let fetchMock: ReturnType<typeof vi.fn>

function urls(): string[] {
  return fetchMock.mock.calls.map((call) => String(call[0]))
}

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("the LinkedIn request", () => {
  it("scrapes one profile synchronously, with the key in a header and only the fields we read", async () => {
    fetchMock.mockResolvedValue(reply({ body: [LINKEDIN_RECORD] }))
    await readLinkedInProfile("lena-example-1a2b3c", KEY, Date.now() + 120_000)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const parsed = new URL(url)
    expect(`${parsed.origin}${parsed.pathname}`).toBe("https://api.brightdata.com/datasets/v3/scrape")
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      dataset_id: "gd_l1viktl72bvl7bjuj0",
      notify: "false",
      include_errors: "true",
      format: "json",
    })
    expect(url).not.toContain(KEY)
    expect(init.method).toBe("POST")
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`)
    const body = JSON.parse(init.body as string)
    expect(body.input).toEqual([{ url: "https://www.linkedin.com/in/lena-example-1a2b3c/" }])
    const fields = body.custom_output_fields.split("|")
    expect(fields).toEqual(["position", "about", "current_company", "experience", "education", "posts", "activity", "error", "error_code"])
    for (const field of ["name", "city", "avatar", "people_also_viewed", "similar_profiles"]) expect(fields).not.toContain(field)
  })

  it("encodes names in other scripts the way LinkedIn writes them", () => {
    expect(linkedinProfileUrl("jürgen-beispiel")).toBe("https://www.linkedin.com/in/j%C3%BCrgen-beispiel/")
  })

  it("follows a scrape that ran past a minute: 202, then progress, then the snapshot", async () => {
    vi.useFakeTimers()
    fetchMock
      .mockResolvedValueOnce(reply({ status: 202, body: { snapshot_id: "sd_example123", message: "Your request is still in progress" } }))
      .mockResolvedValueOnce(reply({ body: { snapshot_id: "sd_example123", status: "running" } }))
      .mockResolvedValueOnce(reply({ body: { snapshot_id: "sd_example123", status: "ready", records: 1 } }))
      .mockResolvedValueOnce(reply({ body: [LINKEDIN_RECORD] }))
    const pending = readLinkedInProfile("lena-example-1a2b3c", KEY, Date.now() + 120_000)
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2)
    expect((await pending).headline).toContain("Product designer")
    expect(urls().slice(1)).toEqual([
      "https://api.brightdata.com/datasets/v3/progress/sd_example123",
      "https://api.brightdata.com/datasets/v3/progress/sd_example123",
      "https://api.brightdata.com/datasets/v3/snapshot/sd_example123?format=json",
    ])
    for (const call of fetchMock.mock.calls.slice(1)) expect((call[1] as RequestInit).method).toBe("GET")
  })

  it("reads a lone object or NDJSON as well as an array", async () => {
    fetchMock.mockResolvedValueOnce(reply({ body: LINKEDIN_RECORD }))
    expect((await readLinkedInProfile("lena-example-1a2b3c", KEY, Date.now() + 120_000)).bio).toContain("cargo bikes")
    fetchMock.mockResolvedValueOnce(reply({ text: `${JSON.stringify(LINKEDIN_RECORD)}\n` + "\n" }))
    expect((await readLinkedInProfile("lena-example-1a2b3c", KEY, Date.now() + 120_000)).bio).toContain("cargo bikes")
    fetchMock.mockResolvedValueOnce(reply({ text: "<html>gateway</html>" }))
    await expect(readLinkedInProfile("lena-example-1a2b3c", KEY, Date.now() + 120_000)).rejects.toMatchObject({ reason: "failed" })
  })

  it.each([
    [401, "Invalid credentials", "blocked"],
    [402, "Payment required", "blocked"],
    [403, "Forbidden", "blocked"],
    [429, "You have too many running jobs for this dataset", "blocked"],
    [400, "Customer is not active", "blocked"],
    [400, '{"error":"Invalid input provided","code":"validation_error"}', "failed"],
    [404, "dataset does not exist", "failed"],
    [500, "Internal server error", "failed"],
  ])("turns HTTP %i (%s) into %s", async (status, text, reason) => {
    fetchMock.mockResolvedValue(reply({ status, text }))
    await expect(readLinkedInProfile("lena-example-1a2b3c", KEY, Date.now() + 120_000)).rejects.toMatchObject({ reason, status })
  })

  it("gives up when Bright Data cannot be reached, or sends a snapshot id that is not one", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"))
    await expect(readLinkedInProfile("lena-example-1a2b3c", KEY, Date.now() + 120_000)).rejects.toMatchObject({ reason: "failed" })
    fetchMock.mockResolvedValueOnce(reply({ status: 202, body: { snapshot_id: "../../account" } }))
    await expect(readLinkedInProfile("lena-example-1a2b3c", KEY, Date.now() + 120_000)).rejects.toMatchObject({ reason: "failed" })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("aborts a scrape that is still open at the read's deadline", async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))),
    )
    const pending = expect(readLinkedInProfile("lena-example-1a2b3c", KEY, Date.now() + 20_000)).rejects.toMatchObject({ reason: "timeout" })
    await vi.advanceTimersByTimeAsync(20_001)
    await pending
    // No snapshot id yet, so there is nothing to cancel.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("does not start when the deadline has already passed", async () => {
    await expect(readLinkedInProfile("lena-example-1a2b3c", KEY, Date.now() - 1)).rejects.toMatchObject({ reason: "timeout" })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("the Instagram request", () => {
  it("triggers a job, polls it and downloads it, asking for no contact details, followers or photos", async () => {
    vi.useFakeTimers()
    fetchMock
      .mockResolvedValueOnce(reply({ body: { snapshot_id: "sd_insta42" } }))
      .mockResolvedValueOnce(reply({ body: { status: "starting" } }))
      .mockResolvedValueOnce(reply({ body: { status: "running" } }))
      .mockResolvedValueOnce(reply({ body: { status: "ready" } }))
      // Ready to collect but not to download yet.
      .mockResolvedValueOnce(reply({ status: 202, body: { status: "building", message: "Snapshot is not ready yet, try again in 10s" } }))
      .mockResolvedValueOnce(reply({ body: { status: "ready" } }))
      .mockResolvedValueOnce(reply({ body: [INSTAGRAM_RECORD] }))
    const pending = readInstagramWithBrightData("example.climbs", KEY, Date.now() + 120_000)
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 5)
    const text = await pending

    expect(text.posts).toHaveLength(2)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const parsed = new URL(url)
    expect(`${parsed.origin}${parsed.pathname}`).toBe("https://api.brightdata.com/datasets/v3/trigger")
    expect(parsed.searchParams.get("dataset_id")).toBe(BRIGHTDATA_DATASETS.instagram.id)
    expect(BRIGHTDATA_DATASETS.instagram.id).toBe("gd_l1vikfch901nx3by4")
    expect(parsed.searchParams.get("include_errors")).toBe("true")
    const body = JSON.parse(init.body as string)
    expect(body.input).toEqual([{ url: "https://www.instagram.com/example.climbs/" }])
    const fields = body.custom_output_fields.split("|")
    // The names Bright Data's output schema accepted on 22 November; an unknown one is a 400.
    expect(fields).toEqual(["is_private", "biography", "bio_hashtags", "posts", "post_hashtags", "error", "error_code"])
    for (const field of ["email_address", "business_email", "phone_number", "business_address", "followers", "related_accounts", "profile_image_link", "full_name"]) {
      expect(fields).not.toContain(field)
    }
    expect(urls().filter((u) => u.includes("/progress/"))).toHaveLength(4)
    expect(urls().filter((u) => u.includes("/snapshot/"))).toHaveLength(2)
  })

  it("cancels a job that is still running at the deadline and reports a timeout", async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("/trigger") ? reply({ body: { snapshot_id: "sd_slow1" } }) : url.endsWith("/cancel") ? reply({ text: "OK" }) : reply({ body: { status: "running" } }),
    )
    const start = Date.now()
    const pending = expect(readInstagramWithBrightData("example.climbs", KEY, start + 30_000)).rejects.toMatchObject({ reason: "timeout" })
    await vi.advanceTimersByTimeAsync(30_000)
    await pending

    const cancel = fetchMock.mock.calls.find((call) => String(call[0]).endsWith("/cancel")) as [string, RequestInit]
    expect(cancel[0]).toBe("https://api.brightdata.com/datasets/v3/snapshot/sd_slow1/cancel")
    expect(cancel[1].method).toBe("POST")
    // Polling stops early enough to leave time for the cancel.
    expect(Date.now() - start).toBeLessThanOrEqual(30_000)
    expect(CANCEL_TIMEOUT_MS).toBeGreaterThan(0)
  })

  it.each([
    [{ status: "failed", error_message: "Account is suspended" }, "blocked"],
    [{ status: "failed", error_message: "Account is new, please activate it in account settings." }, "blocked"],
    [{ status: "failed", error_message: "Something went wrong. Bright Data is looking into it." }, "failed"],
    [{ status: "canceled" }, "failed"],
  ])("turns a job that ended as %o into %s", async (progress, reason) => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValueOnce(reply({ body: { snapshot_id: "sd_ended1" } })).mockResolvedValueOnce(reply({ body: progress }))
    const pending = expect(readInstagramWithBrightData("example.climbs", KEY, Date.now() + 120_000)).rejects.toMatchObject({ reason })
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    await pending
    expect(urls().some((u) => u.endsWith("/cancel"))).toBe(false)
  })
})

describe("what is kept of a LinkedIn profile", () => {
  it("keeps the person's own words: headline, about, roles, schools, their posts and what they shared", () => {
    const text = linkedinText([LINKEDIN_RECORD])
    expect(text.headline).toBe("Product designer at Example Bikes · trail runner")
    expect(text.bio).toContain("I design cargo bikes and spend weekends on trails.")
    expect(text.background).toEqual(["Product designer, Example Bikes", "UX intern, Studio Sample", "Example University of the Arts"])
    expect(text.posts).toEqual([
      "Our new cargo bike is out #cargobike #design",
      "Ten kilometres of mud this morning #trailrunning",
      "Why film photography is back #filmphotography",
    ])
    expect(text.hashtags).toEqual(["cargobike", "design", "trailrunning", "filmphotography"])
  })

  it("never keeps other people, the person's name or city, contact details, links or images", () => {
    const kept = JSON.stringify(linkedinText([LINKEDIN_RECORD]))
    for (const leak of ["Lena Example", "Hamburg", "Max Muster", "Erika", "lena@example.de", "https://", "example-cdn", "sales funnels", "promotion news", "unlabelled"]) {
      expect(kept).not.toContain(leak)
    }
  })

  it("caps every part like an Instagram profile", () => {
    const long = "word ".repeat(400)
    const text = linkedinText([
      {
        position: long,
        about: long,
        experience: Array.from({ length: 30 }, (_, i) => ({ title: `Role ${i}`, company: `Company ${i}` })),
        posts: Array.from({ length: 30 }, (_, i) => ({ title: `Post ${i} ${long}` })),
      },
    ])
    expect(text.headline!.length).toBeLessThanOrEqual(220)
    expect(text.bio!.length).toBeLessThanOrEqual(500)
    expect(text.background).toHaveLength(12)
    expect(text.posts).toHaveLength(12)
    for (const post of text.posts) expect(post.length).toBeLessThanOrEqual(300)
  })

  it("turns Bright Data's error rows into reasons", () => {
    const row = (error_code: string, error = "x") => [{ input: { url: "https://www.linkedin.com/in/x/" }, error, error_code }]
    expect(() => linkedinText(row("dead_page", "The navigation resulted in a dead page (404 status code)"))).toThrow(
      expect.objectContaining({ reason: "not_found" }),
    )
    expect(() => linkedinText(row("private_profile"))).toThrow(expect.objectContaining({ reason: "private" }))
    expect(() => linkedinText(row("bucket_rate_limit"))).toThrow(expect.objectContaining({ reason: "blocked" }))
    expect(() => linkedinText(row("global_rate_limit"))).toThrow(expect.objectContaining({ reason: "blocked" }))
    expect(() => linkedinText(row("", "Profile requires login"))).toThrow(expect.objectContaining({ reason: "blocked" }))
    expect(() => linkedinText(row("something_new"))).toThrow(expect.objectContaining({ reason: "failed" }))
    expect(() => linkedinText([])).toThrow(expect.objectContaining({ reason: "not_found" }))
    expect(() => linkedinText(["not an object"])).toThrow(ProfileReadError)
    expect(() => linkedinText([{ position: "", about: null, posts: [] }])).toThrow(expect.objectContaining({ reason: "empty" }))
  })
})

describe("what is kept of an Instagram profile read with Bright Data", () => {
  it("keeps the bio, captions and the most used hashtags, without contact details, followers, other accounts or links", () => {
    const text = brightDataInstagramText([INSTAGRAM_RECORD])
    expect(text.bio).toBe("Climbing and coffee ☕ write to")
    expect(text.posts).toEqual(["Bouldering at dawn with #climbing", "Morning espresso"])
    expect(text.hashtags).toEqual(["climbing", "boulder"])
    const kept = JSON.stringify(text)
    for (const leak of ["example.com", "work@", "+49", "1200", "someone.else", "friend.climbs", "Anna Example", "example-cdn"]) expect(kept).not.toContain(leak)
  })

  it("uses the profile's hashtag list when the posts carry none", () => {
    const text = brightDataInstagramText([{ biography: "Wildlife", posts: [{ caption: "A snow leopard" }], post_hashtags: ["wildlife", "ocean"] }])
    expect(text.hashtags).toEqual(["wildlife", "ocean"])
  })

  it("fails politely for private, missing and empty profiles", () => {
    expect(() => brightDataInstagramText([{ ...INSTAGRAM_RECORD, is_private: true }])).toThrow(expect.objectContaining({ reason: "private" }))
    expect(() => brightDataInstagramText([{ error: "Page not found", error_code: "dead_page" }])).toThrow(expect.objectContaining({ reason: "not_found" }))
    expect(() => brightDataInstagramText([])).toThrow(expect.objectContaining({ reason: "not_found" }))
    expect(() => brightDataInstagramText([{ is_private: false, biography: "", posts: [] }])).toThrow(expect.objectContaining({ reason: "empty" }))
  })
})
