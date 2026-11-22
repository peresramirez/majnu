// What a shared file really is, from its bytes (issue #77): never its name or
// its declared type. And how many pages a PDF has, without a PDF library.
import { deflateSync } from "node:zlib"
import { describe, expect, it } from "vitest"
import { FILE_LIMITS, checkPdf, checkSharedFile, decodeText, displayFileName, sniffFile } from "@/lib/finder/file-rules"

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((part) => (typeof part === "string" ? Array.from(Buffer.from(part, "latin1")) : part)))

const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0], "rest of a jpeg")
const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "IHDR")
const GIF = bytes("GIF89a", [1, 0, 1, 0])
const WEBP = bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 ")

// A PDF with one plain page object per page.
function plainPdf(pages: number): Uint8Array {
  const objects = Array.from({ length: pages }, (_, i) => `${i + 3} 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n`).join("")
  return bytes(`%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Count ${pages} >>\nendobj\n${objects}%%EOF\n`)
}

// A PDF 1.5 whose page objects are hidden in a compressed object stream, as
// Word and LaTeX write them.
function objectStreamPdf(pages: number): Uint8Array {
  const inner = Array.from({ length: pages }, () => "<< /Type /Page /Parent 2 0 R >>").join("\n")
  const data = deflateSync(Buffer.from(inner, "latin1"))
  const head = Buffer.from(`%PDF-1.5\n5 0 obj\n<< /Type /ObjStm /N ${pages} /First 10 /Filter /FlateDecode /Length ${data.length} >>\nstream\n`, "latin1")
  const tail = Buffer.from("\nendstream\nendobj\n%%EOF\n", "latin1")
  return new Uint8Array(Buffer.concat([head, data, tail]))
}

describe("sniffFile", () => {
  it("tells images, PDFs and text from their first bytes", () => {
    expect(sniffFile(JPEG)).toEqual({ kind: "image", mediaType: "image/jpeg" })
    expect(sniffFile(PNG)).toEqual({ kind: "image", mediaType: "image/png" })
    expect(sniffFile(GIF)).toEqual({ kind: "image", mediaType: "image/gif" })
    expect(sniffFile(WEBP)).toEqual({ kind: "image", mediaType: "image/webp" })
    expect(sniffFile(plainPdf(1))).toEqual({ kind: "pdf", mediaType: "application/pdf" })
    expect(sniffFile(bytes("# Wishlist\n- Kindle\n"))).toEqual({ kind: "text", mediaType: "text/plain" })
  })

  it("refuses anything else, whatever it is called: a Word file, a zip, an executable, HEIC", () => {
    expect(sniffFile(bytes("PK", [3, 4, 0, 0, 0]))).toBeNull()
    expect(sniffFile(bytes([0x4d, 0x5a, 0x90, 0x00]))).toBeNull()
    expect(sniffFile(bytes([0, 0, 0, 0x18], "ftypheic"))).toBeNull()
    expect(sniffFile(bytes("RIFF", [0, 0, 0, 0], "WAVEfmt "))).toBeNull()
    expect(sniffFile(new Uint8Array())).toBeNull()
  })
})

describe("decodeText", () => {
  it("reads UTF-8 with or without a BOM, and refuses invalid UTF-8 and binary control characters", () => {
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...Buffer.from("Grüße", "utf8")]))).toBe("Grüße")
    expect(decodeText(new Uint8Array(Buffer.from("Grüße\tund\r\nmehr", "utf8")))).toBe("Grüße\tund\r\nmehr")
    expect(decodeText(bytes([0xc3, 0x28]))).toBeNull()
    expect(decodeText(bytes("text", [0], "more"))).toBeNull()
  })
})

describe("checkPdf", () => {
  it("counts plain page objects, not the page tree", async () => {
    expect(await checkPdf(plainPdf(3))).toEqual({ ok: true, pages: 3 })
  })

  it("counts page objects inside compressed object streams", async () => {
    expect(await checkPdf(objectStreamPdf(4))).toEqual({ ok: true, pages: 4 })
    expect(await checkPdf(objectStreamPdf(25))).toEqual({ ok: true, pages: 25 })
  })

  it("falls back to the page tree's count, refuses a PDF with no pages it can find, and one with a password", async () => {
    expect(await checkPdf(bytes("%PDF-1.7\n<< /Type /Pages /Kids [] /Count 7 >>\n%%EOF"))).toEqual({ ok: true, pages: 7 })
    expect(await checkPdf(bytes("%PDF-1.7\nnothing here\n%%EOF"))).toEqual({ ok: false, problem: "unreadable" })
    expect(await checkPdf(bytes("%PDF-1.4\n", "trailer << /Root 1 0 R /Encrypt 9 0 R >>\n%%EOF"))).toEqual({ ok: false, problem: "locked" })
  })
})

describe("checkSharedFile", () => {
  it("accepts what may be read, with what the reader needs", async () => {
    expect(await checkSharedFile(JPEG)).toMatchObject({ ok: true, kind: "image", mediaType: "image/jpeg" })
    expect(await checkSharedFile(plainPdf(20))).toMatchObject({ ok: true, kind: "pdf", pages: 20 })
    expect(await checkSharedFile(bytes("Loves matcha"))).toMatchObject({ ok: true, kind: "text", text: "Loves matcha" })
  })

  it("refuses by size: 5 MB for a photo, 10 MB for a PDF, 100 KB for text", async () => {
    const big = (head: Uint8Array, size: number) => {
      const out = new Uint8Array(size)
      out.set(head)
      return out
    }
    expect(await checkSharedFile(big(JPEG, FILE_LIMITS.imageBytes + 1))).toEqual({ ok: false, problem: "too_big", kind: "image" })
    expect(await checkSharedFile(big(plainPdf(1), FILE_LIMITS.pdfBytes + 1))).toEqual({ ok: false, problem: "too_big", kind: "pdf" })
    expect(await checkSharedFile(bytes("a".repeat(FILE_LIMITS.textBytes + 1)))).toEqual({ ok: false, problem: "too_big", kind: "text" })
  })

  it("refuses a PDF over 20 pages, an empty file, an empty text file and an unknown type", async () => {
    expect(await checkSharedFile(plainPdf(21))).toEqual({ ok: false, problem: "pdf_pages", kind: "pdf" })
    expect(await checkSharedFile(objectStreamPdf(21))).toEqual({ ok: false, problem: "pdf_pages", kind: "pdf" })
    expect(await checkSharedFile(new Uint8Array())).toEqual({ ok: false, problem: "empty" })
    expect(await checkSharedFile(bytes("   \n"))).toEqual({ ok: false, problem: "empty", kind: "text" })
    expect(await checkSharedFile(bytes("PK", [3, 4]))).toEqual({ ok: false, problem: "type" })
  })
})

describe("displayFileName", () => {
  it("keeps a name fit for a message: no control characters or angle brackets, at most 60 characters", () => {
    expect(displayFileName("  wish\u0000list<script>.pdf ")).toBe("wishlistscript.pdf")
    expect(displayFileName(`${"a".repeat(70)}.pdf`)).toHaveLength(58)
    expect(displayFileName(undefined)).toBe("")
  })
})
