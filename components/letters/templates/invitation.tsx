// wedding-invite and party-invite, as the registry renders them. A server
// component: when it knows the letter's slug and the invitation has a gift
// list (issue #35), it reads which gifts are already claimed while the page
// renders, so taken gifts arrive as taken. The invitation itself is the client
// component in ./invitation-view.tsx.
//
// Without a slug the gift list reads the claims from GET /api/claim after the
// page has loaded, with its buttons disabled until then. The renderer passes
// the slug once components/letters/registry.tsx does (see docs/features/gift-list.md).
import { claimedIdsForPage } from "@/lib/claims/claim"
import type { LetterContent } from "@/lib/letters/schema"
import { InvitationView } from "./invitation-view"

type Mood = "elegant" | "playful"

export async function Invitation({ content, mood, slug }: { content: LetterContent; mood: Mood; slug?: string }) {
  return <InvitationView content={content} mood={mood} claimed={await claimedIdsForPage(slug, content)} />
}
