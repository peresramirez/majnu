// party-box, as the registry renders it. The party pop box is the 3D gift box
// in its party mood (./gift-box-3d.tsx); when it carries an event it is a party
// invitation and may have a gift list (issue #52). Like the invitations, this
// server component reads which gifts are already claimed while the page
// renders, so taken gifts arrive as taken.
import { claimedIdsForPage } from "@/lib/claims/claim"
import type { LetterContent } from "@/lib/letters/schema"
import { GiftBox3D } from "./gift-box-3d"

export async function PartyBox({ content, slug }: { content: LetterContent; slug?: string }) {
  return <GiftBox3D content={content} mood="party" claimed={await claimedIdsForPage(slug, content)} />
}
