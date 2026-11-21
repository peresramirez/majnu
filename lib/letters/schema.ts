// The letter content contract between the agent side (Dev A) and the template
// side (Dev B). After setup, changes are additive only and need both people:
// renaming or removing a field breaks the other side without warning.
//
// zod is imported from "zod/v4" because the Anthropic SDK's zod helpers need it.
import * as z from "zod/v4"

export const LETTER_TEMPLATE_IDS = ["classic-envelope", "wedding-invite", "party-invite", "gift-reveal", "postcard"] as const
export const CALENDAR_TEMPLATE_IDS = ["advent-classic", "countdown"] as const
export const TEMPLATE_IDS = [...LETTER_TEMPLATE_IDS, ...CALENDAR_TEMPLATE_IDS] as const

export const LetterTemplateId = z.enum(LETTER_TEMPLATE_IDS)
export const CalendarTemplateId = z.enum(CALENDAR_TEMPLATE_IDS)
export const TemplateId = z.enum(TEMPLATE_IDS)
export type LetterTemplateId = z.infer<typeof LetterTemplateId>
export type CalendarTemplateId = z.infer<typeof CalendarTemplateId>
export type TemplateId = z.infer<typeof TemplateId>

export type LetterKind = "letter" | "calendar"

// Each template decides what a palette and a font look like; these are moods, not hex values.
export const Palette = z.enum(["night", "petal", "rose", "sage", "ink"]).describe(
  "Colour mood. night: deep plum and rose gold. petal: soft pink and white. rose: warm blush. sage: muted green and cream. ink: black and white, formal.",
)
export const Font = z.enum(["serif", "sans", "script"]).describe("serif: classic and elegant. sans: modern and plain. script: handwritten feel.")
export const Theme = z.object({ palette: Palette, font: Font })
export type Theme = z.infer<typeof Theme>

export const Gift = z.object({
  title: z.string().describe("What the gift is, e.g. 'Spa day voucher'"),
  description: z.string().optional().describe("One or two sentences about it"),
  url: z.string().optional().describe("Link to redeem or view the gift, https only"),
  code: z.string().optional().describe("Gift card or voucher code. Shown only after the recipient unwraps it"),
  imageUrl: z.string().optional().describe("Image of the gift, https only"),
  price: z.string().optional().describe("Display price with currency, e.g. '€25'"),
})
export type Gift = z.infer<typeof Gift>

export const LetterEvent = z.object({
  title: z.string().describe("e.g. 'Anna and Tom's wedding'"),
  startsAt: z.string().describe("Local date and time in ISO 8601 with offset, e.g. 2026-12-24T19:00:00+01:00"),
  locationName: z.string().describe("e.g. 'Café Einstein'"),
  address: z.string().describe("Street address a map can find"),
})
export type LetterEvent = z.infer<typeof LetterEvent>

export const LetterContent = z.object({
  recipientName: z.string().describe("First name or nickname of the person it is for"),
  senderName: z.string().describe("How the sender signs, e.g. 'Javier' or 'Mum'"),
  occasion: z.string().describe("e.g. 'Birthday', 'Wedding', 'Just because'"),
  headline: z.string().describe("Short opening line, under 60 characters"),
  body: z.array(z.string()).describe("The letter, one paragraph per item, 1 to 6 paragraphs"),
  signOff: z.string().describe("e.g. 'With all my love'"),
  theme: Theme,
  gifts: z.array(Gift).describe("Gifts inside the letter; empty if none"),
  event: LetterEvent.optional().describe("Only for invitations"),
})
export type LetterContent = z.infer<typeof LetterContent>

export const CalendarDoor = z.object({
  day: z.number().int().describe("1-based door number; door N opens on startDate + (N - 1) days"),
  title: z.string().describe("Short title shown when the door opens"),
  message: z.string().describe("A note for that day, one to three sentences"),
  gift: Gift.optional(),
})
export type CalendarDoor = z.infer<typeof CalendarDoor>

export const CalendarContent = z.object({
  recipientName: z.string(),
  senderName: z.string(),
  headline: z.string().describe("e.g. '24 days of us'"),
  intro: z.string().describe("One or two sentences shown above the doors"),
  startDate: z.string().describe("Day door 1 opens, YYYY-MM-DD"),
  timezone: z.string().describe("IANA timezone of the recipient, e.g. Europe/Berlin"),
  theme: Theme,
  doors: z.array(CalendarDoor).describe("advent-classic: exactly 24 doors. countdown: 1 to 31 doors"),
})
export type CalendarContent = z.infer<typeof CalendarContent>

// A letter as stored, as the owner sees it. `content` is null until the builder has run.
export type LetterRecord = {
  id: string
  ownerId: string
  slug: string
  kind: LetterKind
  templateId: TemplateId | null
  title: string | null
  content: LetterContent | CalendarContent | null
  createdAt: string
  updatedAt: string
}

// What a template receives. Locked doors carry only their number and opening date:
// their title, message and gift never leave the server.
export type PublicDoor =
  | { day: number; locked: true; opensOn: string }
  | ({ day: number; locked: false; opensOn: string } & Omit<CalendarDoor, "day">)

export type PublicCalendarContent = Omit<CalendarContent, "doors"> & { doors: PublicDoor[] }

export type PublicLetter =
  | { kind: "letter"; slug: string; templateId: LetterTemplateId; content: LetterContent; ownerPreview: boolean }
  | { kind: "calendar"; slug: string; templateId: CalendarTemplateId; content: PublicCalendarContent; ownerPreview: boolean }
