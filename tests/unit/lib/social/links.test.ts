import { describe, expect, it } from "vitest"
import { isPublicHostname, PAID_SOURCES, parseProfileLink, usesApify } from "@/lib/social/links"

describe("parseProfileLink", () => {
  it("reads Instagram profile links in their usual shapes", () => {
    for (const link of [
      "https://www.instagram.com/natgeo/",
      "https://instagram.com/natgeo",
      "instagram.com/NatGeo?igsh=abc123",
      "http://m.instagram.com/natgeo/",
      "<https://www.instagram.com/natgeo/>",
      "https://www.instagram.com/natgeo/.",
    ]) {
      expect(parseProfileLink(link)).toEqual({ ok: true, target: { source: "instagram", username: "natgeo" } })
    }
    expect(parseProfileLink("https://www.instagram.com/anna.climbs_92/")).toEqual({
      ok: true,
      target: { source: "instagram", username: "anna.climbs_92" },
    })
  })

  it("reads TikTok profile links, also from a video link on the profile", () => {
    expect(parseProfileLink("https://www.tiktok.com/@khaby.lame")).toEqual({ ok: true, target: { source: "tiktok", username: "khaby.lame" } })
    expect(parseProfileLink("tiktok.com/@Khaby.Lame/video/7123456789?lang=de")).toEqual({
      ok: true,
      target: { source: "tiktok", username: "khaby.lame" },
    })
  })

  it("refuses posts, reels, stories and short links: they are not profiles", () => {
    for (const link of [
      "https://www.instagram.com/p/DNQuxufAih9/",
      "https://www.instagram.com/reel/abc/",
      "https://www.instagram.com/stories/natgeo/123/",
      "https://www.instagram.com/explore/tags/climbing/",
      "https://www.instagram.com/",
      "https://www.tiktok.com/tag/climbing",
      "https://vm.tiktok.com/ZMabc123/",
    ]) {
      expect(parseProfileLink(link)).toEqual({ ok: false, problem: "not_a_profile" })
    }
  })

  it("reads LinkedIn profile links from any country subdomain, with or without a trailing slash or query", () => {
    for (const link of [
      "https://www.linkedin.com/in/lena-example-1a2b3c/",
      "https://linkedin.com/in/lena-example-1a2b3c",
      "linkedin.com/in/lena-example-1a2b3c",
      "https://de.linkedin.com/in/lena-example-1a2b3c?originalSubdomain=de",
      "https://uk.linkedin.com/in/lena-example-1a2b3c/?trk=public_profile",
      "http://m.linkedin.com/in/lena-example-1a2b3c//",
      "https://www.linkedin.com/in/lena-example-1a2b3c/details/experience/",
      "<https://www.linkedin.com/in/lena-example-1a2b3c/>.",
    ]) {
      expect(parseProfileLink(link), link).toEqual({ ok: true, target: { source: "linkedin", username: "lena-example-1a2b3c" } })
    }
    expect(parseProfileLink("https://www.linkedin.com/in/j%C3%BCrgen-beispiel/")).toEqual({
      ok: true,
      target: { source: "linkedin", username: "jürgen-beispiel" },
    })
  })

  it("refuses LinkedIn pages that are not a person's profile", () => {
    for (const link of [
      "https://www.linkedin.com/company/example-bikes/",
      "https://www.linkedin.com/school/example-university/",
      "https://www.linkedin.com/posts/lena-example_cargo-activity-7123456789",
      "https://www.linkedin.com/pulse/why-cargo-bikes-lena-example",
      "https://www.linkedin.com/jobs/view/123456/",
      "https://www.linkedin.com/feed/",
      "https://www.linkedin.com/in/",
      "https://www.linkedin.com/in/%E0%A4%A/",
      "https://www.linkedin.com/in/a/",
      "https://www.linkedin.com/",
      "https://lnkd.in/dAbC123",
    ]) {
      expect(parseProfileLink(link), link).toEqual({ ok: false, problem: "not_a_profile" })
    }
    // Not LinkedIn at all, just a name that ends like it.
    expect(parseProfileLink("https://notlinkedin.com/in/lena")).toEqual({ ok: true, target: { source: "web", url: "https://notlinkedin.com/in/lena" } })
  })

  it("takes a bare handle only when the platform is known", () => {
    expect(parseProfileLink("@natgeo")).toEqual({ ok: false, problem: "needs_platform" })
    expect(parseProfileLink("@natgeo", "instagram")).toEqual({ ok: true, target: { source: "instagram", username: "natgeo" } })
    expect(parseProfileLink("anna.climbs", "tiktok")).toEqual({ ok: true, target: { source: "tiktok", username: "anna.climbs" } })
    // Too short for TikTok.
    expect(parseProfileLink("@a", "tiktok")).toEqual({ ok: false, problem: "unsupported" })
    // LinkedIn keeps the case: generated profile names can depend on it.
    expect(parseProfileLink("Lena-Example-1a2b3c", "linkedin")).toEqual({ ok: true, target: { source: "linkedin", username: "Lena-Example-1a2b3c" } })
    expect(parseProfileLink("@lena", "linkedin")).toEqual({ ok: true, target: { source: "linkedin", username: "lena" } })
    expect(parseProfileLink("le", "linkedin")).toEqual({ ok: false, problem: "unsupported" })
  })

  it("reads any other public page over https, without its fragment", () => {
    expect(parseProfileLink("http://anna-example.de/ueber-mich#top")).toEqual({
      ok: true,
      target: { source: "web", url: "https://anna-example.de/ueber-mich" },
    })
    expect(parseProfileLink("annas-blog.com/about")).toEqual({ ok: true, target: { source: "web", url: "https://annas-blog.com/about" } })
  })

  it("never points at a private network, a port, credentials or another scheme", () => {
    for (const link of [
      "http://localhost:3000/",
      "http://127.0.0.1/admin",
      "http://2130706433/",
      "http://[::1]/",
      "http://10.0.0.1/",
      "http://169.254.169.254/latest/meta-data",
      "http://router.local/",
      "http://intranet/",
      "https://user:pass@example.org/",
      "https://anna-example.de:8443/",
      "javascript:alert(1)",
      "ftp://anna-example.de/",
      "file:///etc/passwd",
      "two words",
      "",
      `https://anna-example.de/${"a".repeat(400)}`,
    ]) {
      expect(parseProfileLink(link).ok, link).toBe(false)
    }
  })
})

describe("isPublicHostname", () => {
  it("accepts ordinary hostnames and refuses addresses and internal names", () => {
    expect(isPublicHostname("www.anna-example.de")).toBe(true)
    expect(isPublicHostname("blog.example.co.uk")).toBe(true)
    for (const host of ["localhost", "127.0.0.1", "0x7f000001", "[::1]", "printer.local", "db.internal", "-bad.com", "a"]) {
      expect(isPublicHostname(host), host).toBe(false)
    }
  })
})

describe("usesApify", () => {
  it("counts paid scraper reads (Instagram, TikTok, LinkedIn) against the cap, not other pages", () => {
    expect(usesApify("instagram")).toBe(true)
    expect(usesApify("tiktok")).toBe(true)
    expect(usesApify("linkedin")).toBe(true)
    expect(usesApify("web")).toBe(false)
    expect([...PAID_SOURCES].sort()).toEqual(["instagram", "linkedin", "tiktok"])
  })
})
