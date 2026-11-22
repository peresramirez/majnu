// What the calendar routes accept (lib/calendars/types.ts), checked with zod.
// Everything the sender types is trimmed and capped here, before it reaches
// the letter, the finder session or a model prompt.
import * as z from "zod/v4"
import { CALENDAR_TEMPLATE_IDS } from "@/lib/letters/schema"
import { isIsoDate, MAX_COUNTDOWN_DAYS, NOTE_LIMITS, OWN_GIFT_LIMITS } from "./doors"

const KINDS = ["partner", "parent", "grandparent", "sibling", "friend", "child", "colleague", "other"] as const

const text = (max: number) => z.string().transform((s) => s.replace(/\s+/g, " ").trim().slice(0, max))
const optionalText = (max: number) =>
  z
    .string()
    .optional()
    .transform((s) => s?.replace(/\s+/g, " ").trim().slice(0, max) || undefined)

const Age = z.number().int().min(0).max(120).optional()

export const CalendarSetupBody = z
  .object({
    templateId: z.enum(CALENDAR_TEMPLATE_IDS),
    days: z.number().int().min(1).max(MAX_COUNTDOWN_DAYS).optional(),
    recipientName: text(60).pipe(z.string().min(1)),
    senderName: text(60).pipe(z.string().min(1)),
    relationship: text(80).pipe(z.string().min(1)),
    kind: z.enum(KINDS).catch("other"),
    ageMin: Age,
    ageMax: Age,
    interests: z
      .array(z.string())
      .max(12)
      .transform((items) => items.map((item) => item.replace(/\s+/g, " ").trim().slice(0, 40)).filter(Boolean).slice(0, 8)),
    about: optionalText(600),
    profileLink: optionalText(300),
    doorBudget: text(60).pipe(z.string().min(1)),
    lastDoorBudget: optionalText(60),
    startDate: z.string().refine(isIsoDate, "startDate must be a real date as YYYY-MM-DD"),
    timezone: z.string().min(1).max(64),
    locale: z.object({
      language: z.string().max(35).catch("en"),
      languages: z.array(z.string().max(35)).max(10).optional().catch(undefined),
      timezone: z.string().max(64).optional().catch(undefined),
    }),
  })
  .refine((body) => body.templateId === "advent-classic" || body.days !== undefined, {
    message: "A countdown needs a number of days",
    path: ["days"],
  })
export type CalendarSetupBody = z.infer<typeof CalendarSetupBody>

export const PoolBody = z.object({ similarTo: z.string().min(1).max(64).optional() })

const GiftChoice = z.discriminatedUnion("type", [
  z.object({ type: z.literal("idea"), optionId: z.string().min(1).max(64) }),
  z.object({
    type: z.literal("own"),
    title: z.string().max(OWN_GIFT_LIMITS.title * 2),
    description: z.string().max(OWN_GIFT_LIMITS.description * 2).optional(),
    url: z.string().max(OWN_GIFT_LIMITS.url).optional(),
    price: z.string().max(OWN_GIFT_LIMITS.price * 2).optional(),
    code: z.string().max(OWN_GIFT_LIMITS.code * 2).optional(),
  }),
  z.object({ type: z.literal("keep") }),
])

export const DoorBody = z.object({
  gift: GiftChoice.nullable(),
  title: z.string().max(NOTE_LIMITS.title * 2),
  message: z.string().max(NOTE_LIMITS.message * 2),
})
export type DoorBody = z.infer<typeof DoorBody>

// Door numbers in the path: 1 to 31.
export function parseDay(value: string): number | null {
  if (!/^\d{1,2}$/.test(value)) return null
  const day = Number(value)
  return day >= 1 && day <= MAX_COUNTDOWN_DAYS ? day : null
}
