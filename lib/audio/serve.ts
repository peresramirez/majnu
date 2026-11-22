// The answer to a request for a voice note's file: the whole file (200), the
// byte range asked for (206), or 416 when the range lies outside the file.
// Shared by GET /l/<slug>/audio (recipients) and GET /api/letters/<id>/audio/file
// (the owner). Pure, so the Range answers are unit-tested.
//
// Safari will not play audio/mp4 unless the server answers Range requests with
// 206 and a correct Content-Range, so every answer says Accept-Ranges: bytes.
import { parseRange } from "./rules"

export type AudioFile = {
  body: Blob
  mimeType: string
  // The note's version (lib/audio/rules.ts, noteVersion). Quoted as the ETag.
  version: string
}

// Recipients may keep a note in their own browser for a few minutes, but no
// shared proxy or CDN may keep it: it is private to whoever has the link.
export const AUDIO_CACHE_CONTROL = "private, max-age=300"

const COMMON_HEADERS = {
  "Accept-Ranges": "bytes",
  "Cache-Control": AUDIO_CACHE_CONTROL,
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  // Only our own pages may load it: another site cannot embed the note.
  "Cross-Origin-Resource-Policy": "same-origin",
}

export function audioResponse(request: Request, file: AudioFile): Response {
  const size = file.body.size
  const etag = `"${file.version}"`
  const headers: Record<string, string> = { ...COMMON_HEADERS, "Content-Type": file.mimeType, ETag: etag }
  const head = request.method === "HEAD"

  // If-Range: send the range only if the file is still the one the browser has.
  const ifRange = request.headers.get("if-range")
  const range = ifRange && ifRange !== etag ? { kind: "full" as const } : parseRange(request.headers.get("range"), size)

  if (range.kind === "unsatisfiable") {
    return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}`, "Content-Length": "0" } })
  }
  if (range.kind === "partial") {
    const length = range.end - range.start + 1
    return new Response(head ? null : file.body.slice(range.start, range.end + 1, file.mimeType), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${range.start}-${range.end}/${size}`, "Content-Length": String(length) },
    })
  }
  return new Response(head ? null : file.body, { status: 200, headers: { ...headers, "Content-Length": String(size) } })
}

// Plain-text errors that say nothing about the letter.
export function audioNotFound(status: 404 | 500 = 404): Response {
  return new Response(status === 404 ? "Not found" : "Something went wrong", {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    },
  })
}
