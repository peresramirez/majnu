// Live drafts (issue #30): while the builder streams its JSON, the chat shows
// the page being written. This module turns the unfinished JSON into a draft
// for the screen: parsed tolerantly, cut down to what the draft view shows,
// merged over the current content when editing, and throttled to a few events
// a second.
//
// Drafts are never stored and never reach a template or /l/<slug>: only the
// builder's final, validated and sanitised output is saved. They also leave out
// gift codes and links, which the draft view does not show and which have not
// been through sanitize() yet.
import type { CalendarDraft, DraftGift, LetterDraft } from "./events"

// ---------- Partial JSON ----------

// The value of a JSON text that may stop anywhere: an unfinished string keeps
// what it has, an unfinished key, number or literal is left out, and open
// arrays and objects are closed. Returns undefined when nothing usable is there.
export function parsePartialJson(text: string): unknown {
  let i = 0

  function skipSpace() {
    while (i < text.length && /\s/.test(text[i]!)) i++
  }

  // A string from the opening quote; `done` is false when the text stopped inside it.
  function parseString(): { value: string; done: boolean } {
    i++ // opening quote
    let out = ""
    while (i < text.length) {
      const ch = text[i]!
      if (ch === '"') {
        i++
        return { value: out, done: true }
      }
      if (ch !== "\\") {
        out += ch
        i++
        continue
      }
      const next = text[i + 1]
      if (next === undefined) {
        i = text.length
        break
      }
      if (next === "u") {
        const hex = text.slice(i + 2, i + 6)
        if (hex.length < 4) {
          i = text.length
          break
        }
        out += String.fromCharCode(parseInt(hex, 16))
        i += 6
        continue
      }
      const escapes: Record<string, string> = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", '"': '"', "\\": "\\", "/": "/" }
      out += escapes[next] ?? next
      i += 2
    }
    return { value: out, done: false }
  }

  // Undefined when the value is missing or cut off where it cannot be used.
  function parseValue(): unknown {
    skipSpace()
    const ch = text[i]
    if (ch === undefined) return undefined
    if (ch === "{") return parseObject()
    if (ch === "[") return parseArray()
    if (ch === '"') return parseString().value
    const literal = /^(true|false|null)/.exec(text.slice(i))
    if (literal) {
      i += literal[0].length
      return literal[0] === "true" ? true : literal[0] === "false" ? false : null
    }
    const number = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i))
    if (number) {
      i += number[0].length
      // At the very end the number may still be growing ("12" of "124"): leave it out.
      return i >= text.length ? undefined : Number(number[0])
    }
    // An unfinished literal ("tr") or something that is not JSON.
    i = text.length
    return undefined
  }

  function parseArray(): unknown[] {
    i++ // [
    const out: unknown[] = []
    while (true) {
      skipSpace()
      if (i >= text.length) return out
      if (text[i] === "]") {
        i++
        return out
      }
      if (text[i] === ",") {
        i++
        continue
      }
      const before = i
      const value = parseValue()
      if (value !== undefined) out.push(value)
      if (i === before) i = text.length // nothing consumed: not JSON
    }
  }

  function parseObject(): Record<string, unknown> {
    i++ // {
    const out: Record<string, unknown> = {}
    while (true) {
      skipSpace()
      if (i >= text.length) return out
      const ch = text[i]
      if (ch === "}") {
        i++
        return out
      }
      if (ch === ",") {
        i++
        continue
      }
      if (ch !== '"') {
        i = text.length
        return out
      }
      const key = parseString()
      if (!key.done) return out
      skipSpace()
      if (text[i] !== ":") return out
      i++
      const value = parseValue()
      if (value !== undefined) out[key.value] = value
    }
  }

  return parseValue()
}

// ---------- Merging an edit over the current content ----------

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)

// An edit streams the whole content again, mostly unchanged. While a field is
// still being written (the last one in the partial value), the current text is
// kept as long as the new text is the start of it, so unchanged words do not
// disappear and type themselves again. Fields not reached yet keep their
// current value; finished fields take the new one. `open` is true for the
// value that is still being written.
export function mergeOverCurrent(current: unknown, partial: unknown, open = true): unknown {
  if (!open) return partial
  if (typeof partial === "string") {
    return typeof current === "string" && current.startsWith(partial) ? current : partial
  }
  if (Array.isArray(partial)) {
    const base = Array.isArray(current) ? current : []
    const merged = partial.map((item, index) => mergeOverCurrent(base[index], item, index === partial.length - 1))
    // Items further on may still come: keep showing the current ones until the list is finished.
    return [...merged, ...base.slice(partial.length)]
  }
  if (isRecord(partial)) {
    const base = isRecord(current) ? current : {}
    const keys = Object.keys(partial)
    const last = keys.at(-1)
    const merged: Record<string, unknown> = { ...base }
    for (const key of keys) merged[key] = mergeOverCurrent(base[key], partial[key], key === last)
    return merged
  }
  return partial
}

// ---------- Shaping a draft for the screen ----------

const MAX_TEXT = 4000

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value.slice(0, MAX_TEXT) : undefined
}

function texts(value: unknown, max: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter((v): v is string => typeof v === "string").slice(0, max).map((v) => v.slice(0, MAX_TEXT))
}

// Only what the draft view shows: never a code, a link or an image.
function gift(value: unknown): DraftGift | undefined {
  if (!isRecord(value)) return undefined
  const title = text(value.title)
  if (!title) return undefined
  const description = text(value.description)
  const price = text(value.price)
  return { title, ...(description ? { description } : {}), ...(price ? { price } : {}) }
}

function gifts(value: unknown): DraftGift[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.map(gift).filter((g): g is DraftGift => g !== undefined).slice(0, 10)
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T
}

// Null when there is nothing to show yet.
export function toLetterDraft(value: unknown): LetterDraft | null {
  if (!isRecord(value)) return null
  const event = isRecord(value.event)
    ? compact({
        title: text(value.event.title),
        startsAt: text(value.event.startsAt),
        locationName: text(value.event.locationName),
        address: text(value.event.address),
      })
    : undefined
  const draft = compact<LetterDraft>({
    recipientName: text(value.recipientName),
    senderName: text(value.senderName),
    occasion: text(value.occasion),
    headline: text(value.headline),
    body: texts(value.body, 6),
    signOff: text(value.signOff),
    gifts: gifts(value.gifts),
    event: event && Object.keys(event).length ? event : undefined,
  })
  return Object.keys(draft).length ? draft : null
}

export function toCalendarDraft(value: unknown): CalendarDraft | null {
  if (!isRecord(value)) return null
  const doors = Array.isArray(value.doors)
    ? value.doors
        .filter(isRecord)
        .slice(0, 31)
        .map((door) => {
          const doorGift = gift(door.gift)
          return compact({ title: text(door.title), message: text(door.message), gift: doorGift })
        })
    : undefined
  const draft = compact<CalendarDraft>({
    recipientName: text(value.recipientName),
    senderName: text(value.senderName),
    headline: text(value.headline),
    intro: text(value.intro),
    startDate: text(value.startDate),
    doors,
  })
  return Object.keys(draft).length ? draft : null
}

// ---------- The stream of drafts ----------

// At most one draft event per interval: a few a second is enough to see the
// page grow, and each one is the whole draft so far.
export const DRAFT_INTERVAL_MS = 250

// What the builder writes its streamed text into. It never throws: a draft is
// a nicety, and a bug here must not fail the build.
export type DraftSink = {
  // A piece of the builder's JSON text.
  push(delta: string): void
  // The attempt's text is complete: show what is left.
  flush(): void
  // A retry starts writing from the beginning.
  restart(): void
}

export function createDraftStream<T>(opts: {
  // Turns the partial value into what is sent; null for nothing to show yet.
  shape: (partial: unknown) => T | null
  emit: (draft: T) => void
  intervalMs?: number
  now?: () => number
}): DraftSink {
  const interval = opts.intervalMs ?? DRAFT_INTERVAL_MS
  const now = opts.now ?? Date.now
  let buffer = ""
  let lastAt = -Infinity
  let lastSent = ""
  let pending = false

  function send() {
    pending = false
    lastAt = now()
    try {
      const draft = opts.shape(parsePartialJson(buffer))
      if (draft === null) return
      const json = JSON.stringify(draft)
      if (json === lastSent) return
      lastSent = json
      opts.emit(draft)
    } catch (error) {
      console.error("[agents] draft skipped", error instanceof Error ? error.name : "unknown")
    }
  }

  return {
    push(delta) {
      if (!delta) return
      buffer += delta
      pending = true
      if (now() - lastAt >= interval) send()
    },
    flush() {
      if (pending) send()
    },
    restart() {
      buffer = ""
      pending = false
      lastAt = -Infinity
      lastSent = ""
    },
  }
}
