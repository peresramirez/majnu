// Wrapping a chosen gift (docs/plan.md, "Gift finder", step 5): the builder
// writes a gift reveal, 3D gift box, party pop box, classic envelope or
// postcard around the option the visitor chose, and it is saved as their
// letter, ready to share at /l/<slug>.
//
// The gift on the page is exactly the option that was shown: title,
// description, link and price are copied from the stored options after the
// builder has run, so the model cannot change a link or a price. The option's
// product image is left out on purpose: gift pages load nothing from other
// sites (privacy policy), and a shop's image URL would tell that shop who
// opened the gift and when.
//
// The gift code (issue #71) is the voucher code, gift-card code or order
// details the sender got from the shop. It never goes through the model: it is
// put in gifts[0].code after the build, like the link. Templates show a code
// only once the gift is opened (GiftCard's "Show the code", or after the
// unwrap), and it never reaches the page title or the link preview, which name
// only the template and the recipient (components/letters/page-meta.ts,
// titleFor in lib/agents/builder.ts).
import "server-only"
import { buildContent, titleFor } from "@/lib/agents/builder"
import type { LetterContent } from "@/lib/letters/schema"
import { createLetter, saveLetterContent } from "@/lib/letters/store"
import type { FinderContext, GiftOption, WrapTemplateId } from "./events"

// What POST /api/finder/wrap accepts. The finder offers the same ids, in its
// own order, and the party pop box only for a birthday or a party
// (wrapTemplatesFor in lib/finder/wrap-templates.ts, where the list lives).
export { WRAP_TEMPLATE_IDS } from "./wrap-templates"

export const MAX_GIFT_CODE = 200

export type WrapInput = {
  option: GiftOption
  context: FinderContext
  templateId: WrapTemplateId
  recipientName?: string
  senderName?: string
  note?: string
  giftCode?: string
  now: Date
  timezone: string
}

function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code
  } catch {
    return code
  }
}

// The occasion as the visitor told the finder ("Geburtstag"), when they did;
// otherwise a label that fits the template. The sender's note can still name
// another one.
function occasionLine(templateId: WrapTemplateId, occasion: string | undefined, language: string): string {
  if (occasion) {
    return `Occasion, as the sender told the gift finder: ${occasion}. Use it as occasion, written in ${languageName(language)}, unless the sender's words name another.`
  }
  return templateId === "party-box"
    ? "Occasion: not given unless the sender's words name one. They chose the party pop box, made for birthdays and celebrations, so otherwise use a short celebrating label such as \"Celebration\", in the same language."
    : "Occasion: not given unless the sender's words name one; otherwise use a gentle general label such as \"Just because\", in the same language."
}

// The gift as the page shows it. Never imageUrl (see above). The code only
// when the sender gave one: a shop product has none of its own.
export function giftFromOption(option: GiftOption, giftCode?: string): LetterContent["gifts"][number] {
  const code = giftCode?.trim().slice(0, MAX_GIFT_CODE)
  return {
    title: option.title,
    description: option.description,
    url: option.url,
    ...(option.price ? { price: option.price } : {}),
    ...(code ? { code } : {}),
  }
}

// The builder's brief. Everything it needs is here, because it sees nothing else.
export function wrapBrief(input: Omit<WrapInput, "now" | "timezone" | "giftCode"> & { hasGiftCode?: boolean }): string {
  const { option, context } = input
  const language = context.language || "en"
  const relationship = context.relationship || "someone they love"
  const lines = [
    "The sender used Majnu's gift finder, chose the gift below for someone they love, and wants a page around it to send as a link.",
    `Write everything in ${languageName(language)} (${language}).`,
    `Who the recipient is to the sender: ${relationship}.`,
    // The finder's wrap form always sends a name (issue #71); the fallback is
    // for API callers that send none.
    input.recipientName
      ? `Recipient's name: ${input.recipientName}. Use exactly this as recipientName.`
      : `Recipient's name: not given. Use the way the sender would address their ${relationship} in ${languageName(language)} as recipientName, for example "Mama" for a mother.`,
    input.senderName
      ? `Sender's name: ${input.senderName}.`
      : "Sender's name: not given. Do not invent one. As senderName, use how the recipient knows the sender when the relationship makes it clear without guessing, such as the word for \"your child\" for a parent; otherwise a short warm phrase such as \"someone who loves you\", in the same language.",
    occasionLine(input.templateId, context.occasion, language),
    "This is a gift page, not an invitation: leave event out.",
  ]
  if (input.hasGiftCode) {
    lines.push(
      "The sender also put a voucher or gift code in the gift, which the page reveals once it is opened. You don't see it: never write a code, but you may say that something is waiting inside.",
    )
  }
  if (input.note) {
    lines.push("What the sender wants to say, in their own words (use them):", "<note>", input.note, "</note>")
  } else {
    lines.push("The sender added no message. Write a short, warm and simple text about giving this gift. Do not invent memories or facts about them.")
  }
  lines.push(
    "The gift. Put exactly this one gift in gifts, copied character for character, and no other:",
    `- title: ${option.title}`,
    `- description: ${option.description}`,
    ...(option.price ? [`- price: ${option.price}`] : []),
    `- url: ${option.url}`,
    `Why it suits them, for your own writing (do not copy it as it is): ${option.reason}`,
  )
  return lines.join("\n")
}

// The built content with the chosen gift and nothing else in gifts, the
// sender's code in it, and the names exactly as the sender typed them. The
// finder never learns a date or a place, so any event is one the model made up
// (a party box would show it as the party): it is dropped.
export function withChosenGift(
  content: LetterContent,
  option: GiftOption,
  typed: { recipientName?: string; senderName?: string; giftCode?: string } = {},
): LetterContent {
  const { event, ...rest } = content
  void event
  return {
    ...rest,
    ...(typed.recipientName?.trim() ? { recipientName: typed.recipientName.trim() } : {}),
    ...(typed.senderName?.trim() ? { senderName: typed.senderName.trim() } : {}),
    gifts: [giftFromOption(option, typed.giftCode)],
  }
}

// Builds, then creates and saves the letter. The route has already checked the
// session, the option and the daily letter limit; createLetter() checks the
// limit again as a backstop. Building comes first, so a build that fails does
// not leave an empty letter counted against the day.
export async function wrapOption(input: WrapInput): Promise<{ letterId: string; slug: string }> {
  const built = await buildContent({
    mode: "build",
    templateId: input.templateId,
    brief: wrapBrief({ ...input, hasGiftCode: Boolean(input.giftCode?.trim()) }),
    now: input.now,
    timezone: input.timezone,
    // Every wrapped page is a gift, also on a party box, where one is optional.
    giftRequired: true,
  })
  if (built.kind !== "letter") throw new Error(`The builder returned a ${built.kind} for ${input.templateId}`)
  const content = withChosenGift(built.content, input.option, input)

  const created = await createLetter()
  await saveLetterContent(created.id, {
    kind: "letter",
    templateId: input.templateId,
    title: titleFor(input.templateId, content.recipientName),
    content,
  })
  return { letterId: created.id, slug: created.slug }
}
