// The words on the gift tin's label and on the card inside. Pure, so it is
// tested without a GPU. Never a gift code: the code shows only on the page,
// after the tin is open.
import type { LetterContent } from "@/lib/letters/schema"
import { wholeName } from "../../names"

export type TinWords = {
  occasion: string
  forName: string
  from: string
  eyebrow: string
  giftTitle: string
  price: string
}

export function tinWords(content: LetterContent): TinWords {
  const gifts = content.gifts ?? []
  const first = gifts[0]
  return {
    occasion: content.occasion || "A gift",
    forName: `For ${wholeName(content.recipientName)}`,
    from: content.senderName ? `from ${content.senderName}` : "",
    eyebrow: gifts.length > 1 ? `${gifts.length} gifts inside` : "A gift for you",
    giftTitle: first?.title || content.headline || "Something for you",
    price: first?.price ?? "",
  }
}
