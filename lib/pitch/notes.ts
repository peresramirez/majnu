// The spoken script for the pitch deck: about 270 words for the eight main
// slides, two minutes at a calm pace. The presenter view (N) shows them under
// the slide, and docs/pitch-script.md carries the same words; a unit test
// keeps the two in step.
//
// Server only, like the slides: the deck's words reach the browser only after
// the password gate (lib/pitch/gate.ts).
import "server-only"

export const PITCH_SLIDE_IDS = [
  "cover",
  "wonder",
  "problem",
  "majnu",
  "more",
  "inside",
  "model",
  "name",
  "appendix",
  "launch-film",
  "launch-print",
] as const

// The slides after the last one, for questions; not part of the two minutes.
export const PITCH_APPENDIX_IDS: readonly PitchSlideId[] = ["appendix", "launch-film", "launch-print"]

export type PitchSlideId = (typeof PITCH_SLIDE_IDS)[number]

export const PITCH_NOTES: Record<PitchSlideId, string> = {
  cover:
    "This is Majnu. Tell it who a gift is for, and it finds the right gift and wraps it in a page made for that one person.",
  wonder:
    "Have you ever wondered what to get someone who already has everything? How to make a gift more personal, or truly memorable? Gifting should be about creating memories, not just buying presents.",
  problem:
    "But finding the perfect gift isn't easy. You need inspiration, a way to make it theirs, and time to find and organise it all. So we often pick something ordinary.",
  majnu:
    "With Majnu, you say who it's for: in words, by voice, with their Instagram, TikTok or LinkedIn, or a photo. Majnu builds their profile, asks a few quick questions, and finds six real gifts from real shops, one recommended. It wraps it in a page made for them, and you see when they open it.",
  more:
    "And it's more than a card. An advent calendar gives one gift, a surprise every day, filled door by door. Next come experiences and travel, potentially with partners such as Expedia and Layla.",
  inside:
    "Inside, Majnu's agents run on Claude. They build the person's profile, research the web, recommend gifts and write the page. Stripe takes payments, and Claude Code designs each personalised wrapper in a Daytona sandbox.",
  model:
    "Finding, wrapping and sending are free, with no account. A free account keeps your gifts and the tracker. A one-of-a-kind wrapper is €2.99, once. Our vision: make thoughtful, personal gifts easy for everyone.",
  name: "And the name? In the old love story, Majnu wrote poems for Layla. Layla plans the journey, and Majnu finds the gift. Scan the code to try it. Thank you.",
  appendix:
    "For questions. The finder agent has three tools: read a public profile into a profile of the person, ask one round of quick questions, or find six gifts through a research sub-agent that searches the web. The builder writes the page into a template. Everything is stored in Supabase behind row-level security, and a paid wrapper goes from Stripe through a Cloudflare Queue to Claude Code in a Daytona sandbox.",
  "launch-film":
    "What we post at launch. The film shows the app in 36 seconds: say who it's for, choose a gift, wrap it and send the link.",
  "launch-print":
    "The printed poster, with a code for a free personalised wrapper for the first 100 people, and two posts for social: who is the gift for, and the three steps.",
}
