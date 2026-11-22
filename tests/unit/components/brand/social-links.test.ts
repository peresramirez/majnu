import { describe, expect, it } from "vitest"
import { SOCIAL_ACCOUNTS } from "@/components/brand/social-links"

describe("Majnu's social accounts", () => {
  it("link to the exact profile addresses", () => {
    expect(SOCIAL_ACCOUNTS.map(({ platform, handle, href }) => [platform, handle, href])).toEqual([
      ["TikTok", "@majnu.app", "https://www.tiktok.com/@majnu.app"],
      ["X", "@Majnuapp", "https://x.com/Majnuapp"],
      ["Instagram", "@majnu.app", "https://www.instagram.com/majnu.app"],
    ])
  })
})
