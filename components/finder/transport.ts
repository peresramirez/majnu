// How the finder talks to the server. The landing page uses the real routes;
// /dev/finder passes a mock with the same shape, so every state of the finder
// can be built and checked without the API or a model call.
import {
  FINDER_FILE_PART,
  FINDER_REQUEST_PART,
  type FinderEvent,
  type FinderLimitReason,
  type FinderRequest,
  type WrapRequest,
  type WrapResponse,
  type WrapTemplateId,
} from "@/lib/finder/events"
import { ensureAnonymousSession } from "./anonymous-session"
import { readFinderEvents } from "./ndjson"

export type FinderTransport = {
  // Makes sure the browser has a session before the first request.
  ensureSession(getContainer: () => HTMLElement | null): Promise<void>
  // The events of one reply. Throws FinderRequestError when the request fails
  // before a stream starts. `files` go with it as multipart/form-data (issue #77).
  stream(request: FinderRequest, signal: AbortSignal, files?: UploadFile[]): AsyncIterable<FinderEvent>
  wrap(request: WrapRequest): Promise<WrapResponse>
  // Where the wrapped gift can be previewed by its owner, and the link to send.
  previewUrl(letterId: string, templateId: WrapTemplateId): string
  shareUrl(slug: string): string
}

export type UploadFile = { file: Blob; name: string }

export class FinderRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "FinderRequestError"
  }
}

export const OFFLINE = "Your message didn't reach Majnu. Check your connection and try again."

export function failureMessage(status: number): string {
  if (status === 401 || status === 403) return "Majnu couldn't start your search. Reload the page and try again."
  if (status === 413) return "That message is too long. Try a shorter one."
  if (status === 429) return "That's a lot of searches at once. Wait a minute, then try again."
  return "Something went wrong finding gifts. Try again."
}

const LIMIT_REASONS: FinderLimitReason[] = ["finder_daily", "personalise_daily", "session_full", "site_busy", "signin_required", "files_limit"]

// The JSON body of a request, or with files the multipart one: the request in
// its part and each file in a `file` part. The browser sets the boundary.
export function requestBody(request: FinderRequest, files: UploadFile[] = []): { body: BodyInit; headers: Record<string, string> } {
  if (files.length === 0) return { body: JSON.stringify(request), headers: { "content-type": "application/json", accept: "application/x-ndjson" } }
  const form = new FormData()
  form.append(FINDER_REQUEST_PART, JSON.stringify(request))
  for (const { file, name } of files) form.append(FINDER_FILE_PART, file, name)
  return { body: form, headers: { accept: "application/x-ndjson" } }
}

// The server's own sentence for a refused message or file (400, 413, 415), in
// the visitor's language; otherwise ours for the status.
async function refusal(res: Response): Promise<string> {
  if ([400, 413, 415].includes(res.status)) {
    const body: unknown = await res.json().catch(() => null)
    const error = body && typeof body === "object" ? (body as { error?: unknown }).error : undefined
    if (typeof error === "string" && error && error !== "session_required") return error
  }
  return failureMessage(res.status)
}

export const fetchTransport: FinderTransport = {
  ensureSession: ensureAnonymousSession,

  async *stream(request, signal, files) {
    let res: Response
    try {
      res = await fetch("/api/finder", { method: "POST", ...requestBody(request, files), signal })
    } catch (error) {
      if (signal.aborted) throw error
      throw new FinderRequestError(OFFLINE)
    }
    // A limit or an error may arrive as an event even on an error status.
    const isStream = (res.headers.get("content-type") ?? "").includes("ndjson")
    if (!res.body || (!res.ok && !isStream)) throw new FinderRequestError(await refusal(res))
    yield* readFinderEvents(res.body)
  },

  async wrap(request) {
    let res: Response
    try {
      res = await fetch("/api/finder/wrap", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(request),
      })
    } catch {
      return { error: "The gift didn't reach Majnu. Check your connection and try again." }
    }
    const body: unknown = await res.json().catch(() => null)
    if (body && typeof body === "object") {
      const r = body as Record<string, unknown>
      if (res.ok && typeof r.letterId === "string" && typeof r.slug === "string") return { letterId: r.letterId, slug: r.slug }
      if (typeof r.error === "string" && r.error) {
        const reason = LIMIT_REASONS.find((known) => known === r.reason)
        return reason ? { error: r.error, reason } : { error: r.error }
      }
    }
    return { error: res.status === 429 ? failureMessage(429) : "Something went wrong wrapping the gift. Try again." }
  },

  previewUrl: (letterId) => `/create/${encodeURIComponent(letterId)}/preview`,
  shareUrl: (slug) => `${window.location.origin}/l/${encodeURIComponent(slug)}`,
}

// What the browser tells the finder about the visitor: language and timezone.
// Country and region come from the network on the server, never from here.
export function browserLocale(): FinderRequest["locale"] {
  let timezone: string | undefined
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || undefined
  } catch {
    timezone = undefined
  }
  return {
    language: navigator.language || "en",
    languages: navigator.languages?.length ? [...navigator.languages] : undefined,
    timezone,
  }
}
