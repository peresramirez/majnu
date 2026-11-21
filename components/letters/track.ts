// Reports what a recipient does on a letter page to POST /api/open.
//
// Nothing is stored on the device: no cookies, no localStorage, no visitor id.
// The server derives the visitor from the request (docs/plan.md, "Open
// tracking"). Failures are ignored; a missed event must never break the page.

export type LetterEventType = "open" | "door_open" | "gift_click"

// The request body /api/open receives. `day` is the calendar door for
// door_open, and the door a gift sits behind for gift_click (absent for gifts
// in a letter).
export type LetterEventBody = { slug: string; type: LetterEventType; day?: number }

export const EVENT_ENDPOINT = "/api/open"

export function eventBody(slug: string, type: LetterEventType, day?: number): LetterEventBody {
  return typeof day === "number" && Number.isInteger(day) && day > 0 ? { slug, type, day } : { slug, type }
}

export function sendLetterEvent(body: LetterEventBody): void {
  if (typeof window === "undefined" || typeof fetch !== "function") return
  try {
    fetch(EVENT_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      // Lets the request finish when the recipient taps a link and leaves.
      keepalive: true,
    }).catch(() => {})
  } catch {
    // Ignore: tracking is best effort.
  }
}

// One event of each kind per page load: a door opened twice, or a gift link
// tapped twice, is reported once. Cleared by a reload, never persisted.
const sent = new Set<string>()

export function sendLetterEventOnce(body: LetterEventBody): boolean {
  const key = `${body.slug}:${body.type}:${body.day ?? 0}`
  if (sent.has(key)) return false
  sent.add(key)
  sendLetterEvent(body)
  return true
}

// What templates call to report a tap. In the owner's preview, or without a
// slug, it does nothing at all.
export function makeTracker(slug: string, ownerPreview: boolean) {
  return (type: Exclude<LetterEventType, "open">, day?: number): void => {
    if (ownerPreview || !slug) return
    sendLetterEventOnce(eventBody(slug, type, day))
  }
}

// Reports the one `open` of a page load, unless this is the owner's preview.
export function reportOpen(slug: string, ownerPreview: boolean): void {
  if (ownerPreview || !slug) return
  sendLetterEventOnce(eventBody(slug, "open"))
}
