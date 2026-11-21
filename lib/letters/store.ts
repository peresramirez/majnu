// Reading and writing letters. Signatures are part of the contract; bodies
// marked "not built yet" are filled in by the data work (issues #3 and #8).
import "server-only"
import { calendarFixtures, demoSlugs, letterFixtures } from "./fixtures"
import type { LetterContent, CalendarContent, LetterKind, LetterRecord, PublicLetter, TemplateId } from "./schema"

// ---------- Public side (Dev B's seam) ----------

// The letter behind a public link, render-ready, with locked doors removed.
// Returns null for unknown slugs and for letters that have no content yet.
export async function getPublicLetter(slug: string, now: Date = new Date()): Promise<PublicLetter | null> {
  const demo = demoSlugs[slug as keyof typeof demoSlugs]
  if (demo) {
    const content = demo.kind === "letter" ? letterFixtures[demo.templateId] : calendarFixtures[demo.templateId]
    const record: LetterRecord = {
      id: slug,
      ownerId: "demo",
      slug,
      kind: demo.kind,
      templateId: demo.templateId,
      title: null,
      content,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }
    return toPublicView(record, now, { ownerPreview: false })
  }
  throw new Error("getPublicLetter: database lookup not built yet")
}

// Turns a stored letter into what a template receives. For calendars, doors that
// have not opened yet (in the calendar's timezone) keep only `day`, `locked` and
// `opensOn`; with `ownerPreview` every door is open.
export function toPublicView(letter: LetterRecord, now: Date, opts: { ownerPreview: boolean }): PublicLetter | null {
  void letter
  void now
  void opts
  throw new Error("toPublicView: not built yet")
}

// ---------- Owner side (the signed-in user's own letters) ----------

export type LetterStats = {
  firstOpenedAt: string | null
  lastOpenedAt: string | null
  totalOpens: number
  uniqueVisitors: number
}

export type LetterSummary = {
  id: string
  slug: string
  kind: LetterKind
  templateId: TemplateId | null
  title: string | null
  recipientName: string | null
  hasContent: boolean
  createdAt: string
  updatedAt: string
  stats: LetterStats
}

export type OwnedLetter = LetterRecord & {
  // The conversation exactly as the Anthropic API returned it, replayed append-only.
  chat: unknown[]
}

// Creates an empty letter for the signed-in user (slug and owner set on the server).
export async function createLetter(): Promise<{ id: string; slug: string }> {
  throw new Error("createLetter: not built yet")
}

// The signed-in user's letter, or null if it does not exist or belongs to someone else.
export async function getMyLetter(id: string): Promise<OwnedLetter | null> {
  void id
  throw new Error("getMyLetter: not built yet")
}

// The signed-in user's letters, newest first, with open statistics.
export async function listMyLetters(): Promise<LetterSummary[]> {
  throw new Error("listMyLetters: not built yet")
}

// Saves what the builder produced. Validates `content` against the schema for `kind`.
export async function saveLetterContent(
  id: string,
  input: { kind: LetterKind; templateId: TemplateId; title: string; content: LetterContent | CalendarContent },
): Promise<void> {
  void id
  void input
  throw new Error("saveLetterContent: not built yet")
}

// Replaces the stored conversation. Callers only ever append to what they loaded.
export async function saveChat(id: string, chat: unknown[]): Promise<void> {
  void id
  void chat
  throw new Error("saveChat: not built yet")
}

export type Profile = { plan: "free" | "full-moon"; planRenewsAt: string | null }

// The signed-in user's plan. Users without a profile row count as free.
export async function getMyProfile(): Promise<Profile> {
  throw new Error("getMyProfile: not built yet")
}
