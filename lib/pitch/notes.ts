// The spoken script for the pitch deck: about 260 words for the eight main
// slides, two minutes at a calm pace. The presenter view (N) shows them under
// the slide, and docs/pitch-script.md carries the same words; a unit test
// keeps the two in step.
//
// Server only, like the slides: the deck's words reach the browser only after
// the password gate (lib/pitch/gate.ts).
import "server-only"

export const PITCH_SLIDE_IDS = ["cover", "wonder", "problem", "majnu", "more", "inside", "model", "name", "appendix"] as const

export type PitchSlideId = (typeof PITCH_SLIDE_IDS)[number]

export const PITCH_NOTES: Record<PitchSlideId, string> = {
  cover:
    "This is Majnu. Tell it who a gift is for, and it finds the right gift and wraps it in a page made for that one person.",
  wonder:
    "Have you ever wondered what to get someone who already has everything? How to make a gift more personal, or truly memorable? Gifting should be about creating memories, not just buying presents.",
  problem:
    "But finding the perfect gift isn't easy. You need inspiration, a way to make it theirs, and time to find and organise it all. So we often pick something ordinary.",
  majnu:
    "With Majnu, you say who it's for: in words, by voice, with their Instagram or a photo. Majnu finds three real gifts from real shops and recommends one. It wraps it in a page made for them, and you see when they open it.",
  more:
    "And it's more than a card. An advent calendar gives one gift, a surprise every day, filled door by door. Next come experiences and travel, potentially with partners such as Expedia and Layla.",
  inside:
    "Inside, Majnu's agents run on Claude. They research the web and public profiles, recommend a gift and write the page. Stripe takes payments, and Claude Code designs each personalised wrapper in a Daytona sandbox.",
  model:
    "Finding, wrapping and sending are free, with no account. A free account keeps your gifts and the tracker. A one-of-a-kind wrapper is €2.99, once. Our vision: make thoughtful, personal gifts easy for everyone.",
  name: "And the name? In the old love story, Majnu wrote poems for Layla. Layla plans the journey, and Majnu finds the gift. Scan the code to try it. Thank you.",
  appendix:
    "For questions. The finder agent has three tools: read a public profile, ask a few questions, or find gifts through a research sub-agent that searches the web. The builder writes the page into a template. Everything is stored in Supabase behind row-level security, and a paid wrapper goes from Stripe through a Cloudflare Queue to Claude Code in a Daytona sandbox.",
}
