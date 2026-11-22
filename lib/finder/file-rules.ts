// Photos and documents in the gift finder's chat (issue #77): what may be
// shared, how big it may be, and how a file's real type is told from its first
// bytes. Used by the browser (to refuse a file before it is sent) and by POST
// /api/finder (which decides, whatever the browser said). No server-only code
// here, so the finder's message box can import it.
//
// The server never trusts a file's name or its declared MIME type: an image
// is what its signature says it is, a PDF starts with "%PDF-", and a text file
// is valid UTF-8 without binary control characters.

export type SharedFileKind = "image" | "pdf" | "text"

export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif"

export const FILE_LIMITS = {
  // Files in one message.
  perMessage: 3,
  // Files read in one finder session, and per visitor per UTC day.
  perSession: 6,
  perVisitorPerDay: 12,
  // An image after the browser has scaled it, a PDF, a text file.
  imageBytes: 5 * 1024 * 1024,
  pdfBytes: 10 * 1024 * 1024,
  textBytes: 100 * 1024,
  // All files of one message together: the Worker holds them in memory
  // while they are read.
  messageBytes: 20 * 1024 * 1024,
  pdfPages: 20,
  // The browser scales photos so their long edge is at most this, the size
  // the model reads without scaling them down itself.
  imageEdge: 1568,
} as const

// What the file picker offers. iPhone shows the photo library, the camera and
// Files for this list; HEIC photos arrive as JPEG, and the browser re-encodes
// every image as JPEG anyway.
export const FILE_ACCEPT = "image/*,application/pdf,text/plain,text/markdown,.md,.markdown,.txt"

export type SniffedFile = { kind: "image"; mediaType: ImageMediaType } | { kind: "pdf"; mediaType: "application/pdf" } | { kind: "text"; mediaType: "text/plain" }

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false
  return signature.every((byte, i) => bytes[offset + i] === byte)
}

const ascii = (text: string) => Array.from(text, (c) => c.charCodeAt(0))

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG = [0xff, 0xd8, 0xff]
const GIF87 = ascii("GIF87a")
const GIF89 = ascii("GIF89a")
const RIFF = ascii("RIFF")
const WEBP = ascii("WEBP")
const PDF = ascii("%PDF-")
const UTF8_BOM = [0xef, 0xbb, 0xbf]

// The image types the model reads, from the file's signature.
export function sniffImage(bytes: Uint8Array): ImageMediaType | null {
  if (startsWith(bytes, JPEG)) return "image/jpeg"
  if (startsWith(bytes, PNG)) return "image/png"
  if (startsWith(bytes, GIF87) || startsWith(bytes, GIF89)) return "image/gif"
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) return "image/webp"
  return null
}

// Plain text or Markdown: valid UTF-8 (a BOM is allowed), and no NUL or other
// control characters beyond tabs, line breaks and form feeds. Null otherwise.
export function decodeText(bytes: Uint8Array): string | null {
  const body = startsWith(bytes, UTF8_BOM) ? bytes.subarray(3) : bytes
  let text: string
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(body)
  } catch {
    return null
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000b\u000e-\u001f\u007f]/.test(text)) return null
  return text
}

// What the file really is, from its first bytes (a text file from all of
// them). Null for anything the finder does not read.
export function sniffFile(bytes: Uint8Array): SniffedFile | null {
  const image = sniffImage(bytes)
  if (image) return { kind: "image", mediaType: image }
  if (startsWith(bytes, PDF)) return { kind: "pdf", mediaType: "application/pdf" }
  if (bytes.length > 0 && decodeText(bytes) !== null) return { kind: "text", mediaType: "text/plain" }
  return null
}

export function maxBytesFor(kind: SharedFileKind): number {
  return kind === "image" ? FILE_LIMITS.imageBytes : kind === "pdf" ? FILE_LIMITS.pdfBytes : FILE_LIMITS.textBytes
}

// ---------- PDF pages ----------

// Latin-1 keeps one character per byte, so offsets in the text are offsets in the file.
function latin1(bytes: Uint8Array): string {
  return new TextDecoder("latin1").decode(bytes)
}

// "/Type /Page" but not "/Type /Pages".
const PAGE_OBJECT = /\/Type\s*\/Page(?![A-Za-z])/g
const PAGES_COUNT = /\/Type\s*\/Pages\b[^]{0,400}?\/Count\s+(\d+)|\/Count\s+(\d+)[^]{0,400}?\/Type\s*\/Pages\b/g
const MAX_OBJECT_STREAMS = 200
const MAX_INFLATED_BYTES = 8 * 1024 * 1024

function countMatches(text: string, pattern: RegExp): number {
  pattern.lastIndex = 0
  let count = 0
  while (pattern.exec(text)) count++
  return count
}

async function inflate(data: Uint8Array, budget: { left: number }): Promise<string | null> {
  if (typeof DecompressionStream === "undefined") return null
  try {
    const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate"))
    const reader = stream.getReader()
    const chunks: Uint8Array[] = []
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>
      try {
        chunk = await reader.read()
      } catch {
        // Trailing bytes after the zlib stream end it here; what came before counts.
        break
      }
      if (chunk.done) break
      budget.left -= chunk.value.length
      if (budget.left < 0) {
        await reader.cancel().catch(() => undefined)
        return null
      }
      chunks.push(chunk.value)
    }
    let length = 0
    for (const c of chunks) length += c.length
    const all = new Uint8Array(length)
    let at = 0
    for (const c of chunks) {
      all.set(c, at)
      at += c.length
    }
    return latin1(all)
  } catch {
    return null
  }
}

// Page objects hidden in compressed object streams (PDF 1.5 and later, as
// written by Word, LaTeX and many others).
async function pagesInObjectStreams(bytes: Uint8Array, text: string): Promise<number> {
  const STREAM = /stream\r?\n/g
  const budget = { left: MAX_INFLATED_BYTES }
  let pages = 0
  let seen = 0
  for (let match = STREAM.exec(text); match; match = STREAM.exec(text)) {
    if (text.slice(Math.max(0, match.index - 3), match.index) === "end") continue
    const before = text.slice(Math.max(0, match.index - 600), match.index)
    const dictionary = before.slice(Math.max(0, before.lastIndexOf(" obj")))
    if (!/\/Type\s*\/ObjStm/.test(dictionary) || !/\/FlateDecode/.test(dictionary)) continue
    if (++seen > MAX_OBJECT_STREAMS) break
    const start = match.index + match[0].length
    const declared = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dictionary)
    const endstream = text.indexOf("endstream", start)
    if (endstream < 0) break
    const end = declared ? Math.min(start + Number(declared[1]), endstream) : endstream
    const inflated = await inflate(bytes.subarray(start, end), budget)
    if (inflated) pages += countMatches(inflated, PAGE_OBJECT)
    STREAM.lastIndex = endstream
  }
  return pages
}

export type PdfCheck = { ok: true; pages: number } | { ok: false; problem: "locked" | "unreadable" }

// How many pages a PDF has, without a PDF library: its page objects, counted
// in the file and in its compressed object streams, or else the page tree's
// own count. Password-protected PDFs are refused: the model cannot read them.
// A PDF whose pages cannot be found at all is refused as unreadable rather
// than sent with an unknown length.
export async function checkPdf(bytes: Uint8Array): Promise<PdfCheck> {
  const text = latin1(bytes)
  if (/\/Encrypt\s*(\d+\s+\d+\s+R|<<)/.test(text)) return { ok: false, problem: "locked" }
  let pages = countMatches(text, PAGE_OBJECT)
  pages += await pagesInObjectStreams(bytes, text)
  if (pages === 0) {
    PAGES_COUNT.lastIndex = 0
    for (let match = PAGES_COUNT.exec(text); match; match = PAGES_COUNT.exec(text)) {
      pages = Math.max(pages, Number(match[1] ?? match[2]))
    }
  }
  return pages > 0 ? { ok: true, pages } : { ok: false, problem: "unreadable" }
}

// ---------- One file, checked ----------

export type FileProblem = "type" | "empty" | "too_big" | "pdf_pages" | "pdf_locked" | "pdf_unreadable"

export type CheckedFile =
  | { ok: true; kind: "image"; mediaType: ImageMediaType; bytes: Uint8Array }
  | { ok: true; kind: "pdf"; mediaType: "application/pdf"; bytes: Uint8Array; pages: number }
  | { ok: true; kind: "text"; mediaType: "text/plain"; bytes: Uint8Array; text: string }
  | { ok: false; problem: FileProblem; kind?: SharedFileKind }

// Everything the server checks before a file may be read.
export async function checkSharedFile(bytes: Uint8Array): Promise<CheckedFile> {
  if (bytes.length === 0) return { ok: false, problem: "empty" }
  const sniffed = sniffFile(bytes)
  if (!sniffed) return { ok: false, problem: "type" }
  if (bytes.length > maxBytesFor(sniffed.kind)) return { ok: false, problem: "too_big", kind: sniffed.kind }
  if (sniffed.kind === "image") return { ok: true, kind: "image", mediaType: sniffed.mediaType, bytes }
  if (sniffed.kind === "text") {
    const text = decodeText(bytes)
    if (text === null || !text.trim()) return { ok: false, problem: "empty", kind: "text" }
    return { ok: true, kind: "text", mediaType: "text/plain", bytes, text }
  }
  const pdf = await checkPdf(bytes)
  if (!pdf.ok) return { ok: false, problem: pdf.problem === "locked" ? "pdf_locked" : "pdf_unreadable", kind: "pdf" }
  if (pdf.pages > FILE_LIMITS.pdfPages) return { ok: false, problem: "pdf_pages", kind: "pdf" }
  return { ok: true, kind: "pdf", mediaType: "application/pdf", bytes, pages: pdf.pages }
}

// A file name as it may appear in a message to the visitor: no control
// characters or angle brackets, at most 60 characters. Never sent to the model.
export function displayFileName(name: string | undefined | null): string {
  // eslint-disable-next-line no-control-regex
  const clean = (name ?? "").replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim()
  if (!clean) return ""
  return clean.length > 60 ? `${clean.slice(0, 57)}…` : clean
}
