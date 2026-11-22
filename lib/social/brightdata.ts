// Reading a public LinkedIn or Instagram profile with Bright Data's Scraper API
// (issue #74), only when the sender pasted it into the gift finder. LinkedIn
// is read only here; Instagram is read here when Apify could not read it
// (lib/social/read.ts). docs/features/social-profiles.md.
//
// Plain fetch, with the API key in the Authorization header, never in a URL:
// - LinkedIn (dataset gd_l1viktl72bvl7bjuj0): one synchronous
//   POST /datasets/v3/scrape, which answers with the record in a few seconds.
//   A scrape that runs past Bright Data's one-minute limit answers 202 with a
//   snapshot_id instead, and is then polled like an asynchronous one.
// - Instagram (dataset gd_l1vikfch901nx3by4): POST /datasets/v3/trigger, then
//   GET /datasets/v3/progress/<id> every few seconds, then
//   GET /datasets/v3/snapshot/<id>?format=json. Measured on 22 November, its
//   scraper takes about 95 s for one profile, so the synchronous call would only
//   hold the connection for a minute and answer 202; triggering gets the
//   snapshot id at once, which lets us cancel the job when time runs out.
//
// Everything stays within the read's deadline. A job still running at the
// deadline is cancelled (POST /datasets/v3/snapshot/<id>/cancel), so it
// delivers nothing.
//
// `custom_output_fields` asks for the few fields we read, so contact details,
// follower counts, photos and other people's profiles (people_also_viewed,
// similar_profiles, related_accounts) are not sent to us. Bright Data refuses
// a name that is not in the scraper's output schema with a 400 (no job runs);
// both lists were checked against it on 22 November. `include_errors` turns
// a profile that could not be read into a row with `error_code`, which becomes
// a ProfileReadError reason. What comes back is cut down to the person's own
// words, kept in memory for the one model call that turns it into interests,
// and never stored or logged.
import "server-only"
import * as z from "zod/v4"
import {
  hasContent,
  hashtag,
  MAX_BIO,
  MAX_CAPTION,
  MAX_POSTS,
  ProfileReadError,
  scrub,
  topHashtags,
  type ProfileText,
  type ReadFailure,
} from "./apify"

export const BRIGHTDATA_API = "https://api.brightdata.com/datasets/v3"

type Dataset = { id: string; mode: "sync" | "async"; fields: readonly string[] }

export const BRIGHTDATA_DATASETS = {
  linkedin: {
    id: "gd_l1viktl72bvl7bjuj0",
    mode: "sync",
    fields: ["position", "about", "current_company", "experience", "education", "posts", "activity", "error", "error_code"],
  },
  instagram: {
    id: "gd_l1vikfch901nx3by4",
    mode: "async",
    fields: ["is_private", "biography", "bio_hashtags", "posts", "post_hashtags", "error", "error_code"],
  },
} as const satisfies Record<string, Dataset>

// The synchronous scrape answers within a minute (with the record, or 202 and
// a snapshot id); the request gives up a little later.
export const SYNC_TIMEOUT_MS = 70_000
// Every other call (trigger, progress, snapshot) is quick.
const CALL_TIMEOUT_MS = 15_000
// Kept free at the end of the read to cancel a job that is still running.
export const CANCEL_TIMEOUT_MS = 3_000
// How often a running job is checked. Bright Data's own 202 asks for 10 s; a
// shorter wait saves the visitor a few seconds at the cost of a few free calls.
export const POLL_INTERVAL_MS = 5_000

const MAX_HEADLINE = 220
const MAX_BACKGROUND = 12
const MAX_BACKGROUND_LINE = 120

const SNAPSHOT_ID = /^[A-Za-z0-9_-]{1,64}$/

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// A response read in full, inside the request's timeout.
type Reply = { status: number; ok: boolean; text: string }

// One request, bounded by its own timeout and by the read's deadline.
async function call(url: string, init: RequestInit, apiKey: string, timeoutMs: number, deadline: number): Promise<Reply> {
  const timeout = Math.min(timeoutMs, deadline - Date.now())
  if (timeout <= 0) throw new ProfileReadError("timeout")
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(url, {
      ...init,
      headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    })
    return { status: response.status, ok: response.ok, text: await response.text() }
  } catch {
    throw new ProfileReadError(controller.signal.aborted ? "timeout" : "failed")
  } finally {
    clearTimeout(timer)
  }
}

// 401 bad key, 402 out of balance, 403 not allowed, 429 too many jobs. A 400
// that says the account is not active (the Instagram scraper answered
// "Customer is not active" on 21 November) is the account, not the request.
function httpFailure(reply: Reply): ProfileReadError {
  const status = reply.status
  if (status === 401 || status === 402 || status === 403 || status === 429) return new ProfileReadError("blocked", status)
  if (status === 408) return new ProfileReadError("timeout", status)
  if (status === 400 && /not active|suspended|activate/i.test(reply.text)) return new ProfileReadError("blocked", status)
  return new ProfileReadError("failed", status)
}

// format=json gives an array; a lone object or NDJSON is read as well.
function records(reply: Reply): unknown[] {
  try {
    const body: unknown = JSON.parse(reply.text)
    if (Array.isArray(body)) return body
    if (body && typeof body === "object") return [body]
  } catch {
    const lines = reply.text.split("\n").filter((line) => line.trim())
    try {
      if (lines.length) return lines.map((line) => JSON.parse(line) as unknown)
    } catch {
      // Not NDJSON either.
    }
  }
  throw new ProfileReadError("failed", reply.status)
}

function snapshotId(reply: Reply): string {
  let id: unknown
  try {
    id = (JSON.parse(reply.text) as { snapshot_id?: unknown }).snapshot_id
  } catch {
    // Handled below.
  }
  if (typeof id !== "string" || !SNAPSHOT_ID.test(id)) throw new ProfileReadError("failed", reply.status)
  return id
}

const Progress = z.object({
  status: z.string().catch("unknown"),
  error_message: z.string().nullish().catch(null),
})

// Best effort: a cancelled job delivers nothing. Never throws.
async function cancel(id: string, apiKey: string): Promise<void> {
  try {
    await call(`${BRIGHTDATA_API}/snapshot/${id}/cancel`, { method: "POST" }, apiKey, CANCEL_TIMEOUT_MS, Date.now() + CANCEL_TIMEOUT_MS)
  } catch {
    // The job may have finished or may finish anyway; nothing more to do.
  }
}

// Waits for a job and downloads its records, or cancels it at the deadline.
async function poll(id: string, apiKey: string, deadline: number): Promise<unknown[]> {
  const end = deadline - CANCEL_TIMEOUT_MS
  try {
    for (;;) {
      const left = end - Date.now()
      if (left <= 0) throw new ProfileReadError("timeout")
      await sleep(Math.min(POLL_INTERVAL_MS, left))
      const progress = await call(`${BRIGHTDATA_API}/progress/${id}`, { method: "GET" }, apiKey, CALL_TIMEOUT_MS, end)
      if (!progress.ok) throw httpFailure(progress)
      let state: z.infer<typeof Progress>
      try {
        state = Progress.parse(JSON.parse(progress.text))
      } catch {
        throw new ProfileReadError("failed", progress.status)
      }
      if (state.status === "failed" || state.status === "canceled") {
        // "Account is suspended", "Account is new, please activate it": the account, not the profile.
        throw new ProfileReadError(/suspended|activate/i.test(state.error_message ?? "") ? "blocked" : "failed")
      }
      if (state.status !== "ready") continue
      const snapshot = await call(`${BRIGHTDATA_API}/snapshot/${id}?format=json`, { method: "GET" }, apiKey, CALL_TIMEOUT_MS, end)
      // 202: ready to collect, not yet to download.
      if (snapshot.status === 202) continue
      if (!snapshot.ok) throw httpFailure(snapshot)
      return records(snapshot)
    }
  } catch (error) {
    if (error instanceof ProfileReadError && error.reason === "timeout") await cancel(id, apiKey)
    throw error
  }
}

// The records for one profile URL.
export async function collect(dataset: Dataset, url: string, apiKey: string, deadline: number): Promise<unknown[]> {
  const params = new URLSearchParams({ dataset_id: dataset.id, notify: "false", include_errors: "true" })
  const body = JSON.stringify({ input: [{ url }], custom_output_fields: dataset.fields.join("|") })
  if (dataset.mode === "sync") {
    params.set("format", "json")
    const response = await call(`${BRIGHTDATA_API}/scrape?${params}`, { method: "POST", body }, apiKey, SYNC_TIMEOUT_MS, deadline)
    if (response.status === 202) return poll(snapshotId(response), apiKey, deadline)
    if (!response.ok) throw httpFailure(response)
    return records(response)
  }
  const response = await call(`${BRIGHTDATA_API}/trigger?${params}`, { method: "POST", body }, apiKey, CALL_TIMEOUT_MS, deadline)
  if (!response.ok) throw httpFailure(response)
  return poll(snapshotId(response), apiKey, deadline)
}

// ---------- What is kept ----------

const text = z.string().nullish().catch(null)

// Lists are read item by item: one odd item costs that item, not the list.
function list<T extends z.ZodType>(item: T) {
  return z
    .array(z.unknown())
    .nullish()
    .catch(null)
    .transform((items) =>
      (items ?? []).flatMap((value) => {
        const parsed = item.safeParse(value)
        return parsed.success ? [parsed.data as z.infer<T>] : []
      }),
    )
}

const ErrorFields = { error: text, error_code: text }

// Bright Data's record-level errors (include_errors=true). Branch on the code;
// the message is a fallback, because its wording changes.
function rowFailure(row: { error?: string | null; error_code?: string | null }): ReadFailure | null {
  const code = (row.error_code ?? "").toLowerCase()
  const message = (row.error ?? "").toLowerCase()
  if (!code && !message) return null
  if (code.includes("private") || /\bprivate\b/.test(message)) return "private"
  if (code === "dead_page" || code.includes("not_found") || /not found|does not exist|dead page|404/.test(message)) return "not_found"
  if (code.includes("rate_limit") || code.includes("blocked") || code.includes("login") || /rate limit|blocked|log ?in/.test(message)) return "blocked"
  return "failed"
}

function firstRecord<T extends z.ZodType>(schema: T, items: unknown[]): z.infer<T> {
  if (items.length === 0) throw new ProfileReadError("not_found")
  const parsed = schema.safeParse(items[0])
  if (!parsed.success) throw new ProfileReadError("failed")
  return parsed.data as z.infer<T>
}

// Hashtags written into a text ("#trailrunning"), for sources without a hashtag field.
function hashtagsIn(value: string): (string | undefined)[] {
  return [...value.matchAll(/(?:^|[^\p{L}\p{N}_&])#([\p{L}\p{N}_]{2,40})/gu)].map((match) => hashtag(match[1]))
}

// Bright Data sometimes keeps the punctuation after a tag ("PhotoArk,").
function cleanTag(tag: string | null | undefined): string | undefined {
  return hashtag(tag?.replace(/[^\p{L}\p{N}_]+$/u, ""))
}

function unique(lines: string[], max: number): string[] {
  const seen = new Set<string>()
  const kept: string[] = []
  for (const line of lines) {
    const key = line.toLocaleLowerCase()
    if (!line || seen.has(key)) continue
    seen.add(key)
    kept.push(line)
    if (kept.length === max) break
  }
  return kept
}

const LinkedInRecord = z.object({
  position: text,
  about: text,
  current_company: z.object({ name: text, title: text }).nullish().catch(null),
  experience: list(z.object({ title: text, company: text })),
  education: list(z.object({ title: text })),
  posts: list(z.object({ title: text })),
  activity: list(z.object({ interaction: text, title: text })),
  ...ErrorFields,
})

// LinkedIn labels each item of a profile's activity with how the person took
// part. Only what they shared or posted is theirs; a like or a comment is
// mostly someone else's words.
function sharedByThem(interaction: string | null | undefined): boolean {
  return /\b(shared|posted|reposted)\b/i.test(interaction ?? "")
}

function role(title: string | null | undefined, company: string | null | undefined): string {
  return scrub([title, company].map((part) => part?.trim()).filter(Boolean).join(", "), MAX_BACKGROUND_LINE)
}

// The person's own words on a LinkedIn profile: headline, about, current role,
// past roles, schools, their own posts and what they shared. Never their name,
// city, photos or links, and never the other people the profile shows.
export function linkedinText(items: unknown[]): ProfileText {
  const item = firstRecord(LinkedInRecord, items)
  const failure = rowFailure(item)
  if (failure) throw new ProfileReadError(failure)
  const headline = scrub(item.position, MAX_HEADLINE)
  const bio = scrub(item.about, MAX_BIO)
  const background = unique(
    [
      role(item.current_company?.title, item.current_company?.name),
      ...item.experience.map((job) => role(job.title, job.company)),
      ...item.education.map((school) => scrub(school.title, MAX_BACKGROUND_LINE)),
    ],
    MAX_BACKGROUND,
  )
  const own = [...item.posts.map((post) => post.title), ...item.activity.filter((entry) => sharedByThem(entry.interaction)).map((entry) => entry.title)]
  const posts = unique(
    own.map((title) => scrub(title, MAX_CAPTION)),
    MAX_POSTS,
  )
  const result: ProfileText = {
    ...(headline ? { headline } : {}),
    ...(bio ? { bio } : {}),
    ...(background.length ? { background } : {}),
    posts,
    hashtags: topHashtags([bio, ...posts].flatMap(hashtagsIn)),
  }
  if (!hasContent(result)) throw new ProfileReadError("empty")
  return result
}

const InstagramRecord = z.object({
  is_private: z.boolean().nullish().catch(null),
  biography: text,
  bio_hashtags: list(z.string()),
  posts: list(z.object({ caption: text, post_hashtags: list(z.string()) })),
  post_hashtags: list(z.string()),
  ...ErrorFields,
})

// The same cut as instagramText() for Apify's records: bio, recent captions
// and the most used hashtags. This scraper has no category field.
export function brightDataInstagramText(items: unknown[]): ProfileText {
  const item = firstRecord(InstagramRecord, items)
  const failure = rowFailure(item)
  if (failure) throw new ProfileReadError(failure)
  if (item.is_private) throw new ProfileReadError("private")
  const posts = item.posts.slice(0, MAX_POSTS)
  const bio = scrub(item.biography, MAX_BIO)
  const postTags = posts.flatMap((post) => post.post_hashtags)
  // The profile-level list repeats the posts' tags; use it only when the posts carry none.
  const tags = [...item.bio_hashtags, ...(postTags.length ? postTags : item.post_hashtags)]
  const result: ProfileText = {
    ...(bio ? { bio } : {}),
    posts: posts.map((post) => scrub(post.caption, MAX_CAPTION)).filter(Boolean),
    hashtags: topHashtags(tags.map(cleanTag)),
  }
  if (!hasContent(result)) throw new ProfileReadError("empty")
  return result
}

export function linkedinProfileUrl(name: string): string {
  return `https://www.linkedin.com/in/${encodeURIComponent(name)}/`
}

export async function readLinkedInProfile(name: string, apiKey: string, deadline: number): Promise<ProfileText> {
  return linkedinText(await collect(BRIGHTDATA_DATASETS.linkedin, linkedinProfileUrl(name), apiKey, deadline))
}

export async function readInstagramWithBrightData(username: string, apiKey: string, deadline: number): Promise<ProfileText> {
  return brightDataInstagramText(await collect(BRIGHTDATA_DATASETS.instagram, `https://www.instagram.com/${username}/`, apiKey, deadline))
}
