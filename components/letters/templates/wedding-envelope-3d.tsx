// wedding-envelope-3d, as the registry renders it (issue #52). A server
// component: when it knows the letter's slug and the invitation has a gift
// list, it reads which gifts are already claimed while the page renders, so
// taken gifts arrive as taken (as ./invitation.tsx does). The envelope itself,
// with its on-demand three.js scene, is the client component in
// ./wedding-envelope-3d/view.tsx. This file never imports three.js.
import { claimedIdsForPage } from "@/lib/claims/claim"
import type { LetterContent } from "@/lib/letters/schema"
import { WeddingEnvelopeView } from "./wedding-envelope-3d/view"

export async function WeddingEnvelope3D({ content, slug }: { content: LetterContent; slug?: string }) {
  return <WeddingEnvelopeView content={content} claimed={await claimedIdsForPage(slug, content)} />
}
