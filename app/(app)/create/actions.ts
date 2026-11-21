"use server"

import { getMyLetter } from "@/lib/letters/store"

export type GiftLinkInfo = { slug: string; title: string | null; recipientName: string | null }

// The share link and name of a gift made in this chat. The `letter` and
// `preview` events carry only the id, so the create page asks for the rest once
// the page exists. getMyLetter only returns the signed-in user's own letters.
export async function getGiftLinkInfo(id: string): Promise<GiftLinkInfo | null> {
  if (typeof id !== "string" || id.length === 0 || id.length > 64) return null
  try {
    const letter = await getMyLetter(id)
    if (!letter) return null
    return { slug: letter.slug, title: letter.title, recipientName: letter.content?.recipientName ?? null }
  } catch {
    return null
  }
}
