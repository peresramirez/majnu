// Photos and documents in the finder's message box (issue #77), on the
// browser's side: what a picked, pasted or dropped file is, and the file that
// is sent. Images are scaled so their long edge is at most 1568 px and
// re-encoded as JPEG, which also drops what a photo's metadata says (such as
// where it was taken). PDFs and text files are sent as they are. The server
// checks everything again (lib/finder/file-rules.ts); this only spares the
// visitor a refused upload.
import { FILE_LIMITS, decodeText, displayFileName, sniffImage, type SharedFileKind } from "@/lib/finder/file-rules"

export type Attachment = {
  id: string
  // As the visitor's device named it; shown in the preview and sent with the
  // file for the server's messages, never to the model.
  name: string
  kind: SharedFileKind
  file: Blob
  // An object URL of the scaled photo, for its preview. Revoked on removal.
  previewUrl?: string
}

export type Prepared = { ok: true; attachment: Omit<Attachment, "id" | "previewUrl"> } | { ok: false; error: string }

// The biggest original photo the browser tries to scale: beyond this, decoding
// it could take a phone's memory.
const MAX_ORIGINAL_IMAGE_BYTES = 50 * 1024 * 1024
const JPEG_QUALITIES = [0.85, 0.72, 0.6]

const TEXT_EXTENSIONS = /\.(txt|md|markdown)$/i

const mb = (bytes: number) => Math.round(bytes / (1024 * 1024))

export const FILE_TEXTS = {
  type: (name: string) => `${name || "This file"} isn't a photo, PDF or text file. Majnu can read photos, PDFs and plain text.`,
  empty: (name: string) => `${name || "This file"} is empty.`,
  photoUnreadable: (name: string) => `${name || "This photo"} couldn't be opened here. Try a JPEG or PNG, or a screenshot.`,
  imageTooBig: (name: string) => `${name || "This photo"} is too large, even made smaller. Try a screenshot of it.`,
  originalTooBig: (name: string) => `${name || "This photo"} is too large. Photos can be up to ${mb(MAX_ORIGINAL_IMAGE_BYTES)} MB.`,
  pdfTooBig: (name: string) => `${name || "This PDF"} is too large. PDFs can be up to ${mb(FILE_LIMITS.pdfBytes)} MB.`,
  textTooBig: (name: string) => `${name || "This text file"} is too long. Text files can be up to ${Math.round(FILE_LIMITS.textBytes / 1024)} KB.`,
  tooMany: `Share up to ${FILE_LIMITS.perMessage} files in one message.`,
  sessionFull: `One search can read ${FILE_LIMITS.perSession} files. Start a new search to share more, or tell Majnu about them in words.`,
  together: "These files are too large together. Share fewer at once.",
}

// The file's own name, cleaned for showing; a pasted image has none worth showing.
export function fileLabel(name: string | undefined, kind: SharedFileKind): string {
  const clean = displayFileName(name)
  if (!clean || (kind === "image" && /^image\.(png|jpe?g|gif|webp)$/i.test(clean))) return kind === "image" ? "Photo" : kind === "pdf" ? "PDF" : "Text file"
  return clean.length > 40 ? `${clean.slice(0, 37)}…` : clean
}

// What the file looks like from its type, its name and its first bytes.
export async function guessKind(file: File): Promise<SharedFileKind | null> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  if (sniffImage(head)) return "image"
  if (head.length >= 5 && String.fromCharCode(...head.subarray(0, 5)) === "%PDF-") return "pdf"
  // HEIC and other photos the browser may still be able to open and re-encode.
  if (file.type.startsWith("image/")) return "image"
  if (file.type === "text/plain" || file.type === "text/markdown" || TEXT_EXTENSIONS.test(file.name)) return "text"
  return null
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.decoding = "async"
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("decode"))
    }
    img.src = url
  })
}

// The size a photo is drawn at: its long edge at most `edge`, never enlarged.
export function scaledSize(width: number, height: number, edge: number = FILE_LIMITS.imageEdge): { width: number; height: number } {
  const scale = Math.min(1, edge / Math.max(width, height, 1))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality))
}

// The photo scaled and re-encoded as JPEG on a white background (a
// transparent PNG would otherwise turn black). The browser applies the
// photo's own orientation when it draws it.
async function scalePhoto(file: File): Promise<Blob | null> {
  const img = await loadImage(file)
  const { width, height } = scaledSize(img.naturalWidth, img.naturalHeight)
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context) return null
  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, width, height)
  context.drawImage(img, 0, 0, width, height)
  for (const quality of JPEG_QUALITIES) {
    const blob = await toBlob(canvas, quality)
    if (blob && blob.size <= FILE_LIMITS.imageBytes) return blob
  }
  return null
}

// The file ready to send, or why not.
export async function prepareFile(file: File): Promise<Prepared> {
  const name = displayFileName(file.name)
  if (file.size === 0) return { ok: false, error: FILE_TEXTS.empty(name) }
  const kind = await guessKind(file)
  if (!kind) return { ok: false, error: FILE_TEXTS.type(name) }

  if (kind === "image") {
    if (file.size > MAX_ORIGINAL_IMAGE_BYTES) return { ok: false, error: FILE_TEXTS.originalTooBig(name) }
    let scaled: Blob | null
    try {
      scaled = await scalePhoto(file)
    } catch {
      return { ok: false, error: FILE_TEXTS.photoUnreadable(name) }
    }
    if (!scaled) return { ok: false, error: FILE_TEXTS.imageTooBig(name) }
    const jpegName = `${(file.name || "photo").replace(/\.[^.]+$/, "") || "photo"}.jpg`
    return { ok: true, attachment: { name: jpegName, kind, file: scaled } }
  }
  if (kind === "pdf") {
    if (file.size > FILE_LIMITS.pdfBytes) return { ok: false, error: FILE_TEXTS.pdfTooBig(name) }
    return { ok: true, attachment: { name: file.name || "document.pdf", kind, file } }
  }
  if (file.size > FILE_LIMITS.textBytes) return { ok: false, error: FILE_TEXTS.textTooBig(name) }
  if (decodeText(new Uint8Array(await file.arrayBuffer())) === null) return { ok: false, error: FILE_TEXTS.type(name) }
  return { ok: true, attachment: { name: file.name || "notes.txt", kind, file } }
}

// How many more files may be added: this message's 3, and this search's 6
// less those already sent. The server decides in the end.
export function roomFor(attached: number, sentInSearch: number): number {
  return Math.max(0, Math.min(FILE_LIMITS.perMessage - attached, FILE_LIMITS.perSession - sentInSearch - attached))
}

// Files from a paste: only when the clipboard carries files (a copied photo
// or screenshot). Text pastes as usual.
export function filesFromClipboard(data: DataTransfer | null): File[] {
  if (!data) return []
  const files = Array.from(data.files ?? [])
  if (files.length > 0) return files
  return Array.from(data.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null)
}

export function hasDraggedFiles(data: DataTransfer | null): boolean {
  return Boolean(data && Array.from(data.types ?? []).includes("Files"))
}
