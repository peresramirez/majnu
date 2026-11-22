// The finder's message box with photos and documents (issue #77): what the
// browser checks and sends, how sent files are shown and counted, and the
// note chips.
import { describe, expect, it } from "vitest"
import { fileLabel, filesFromClipboard, roomFor, scaledSize } from "@/components/finder/attachments"
import { contextChips } from "@/components/finder/context-chips"
import { filesSent, finderReducer, initialFinderState, type FinderAction, type FinderState } from "@/components/finder/finder-state"
import { requestBody } from "@/components/finder/transport"
import { FILE_LIMITS } from "@/lib/finder/file-rules"

const run = (actions: FinderAction[], from: FinderState = initialFinderState()) => actions.reduce(finderReducer, from)

describe("scaling photos", () => {
  it("brings the long edge down to 1568 px and never enlarges", () => {
    expect(scaledSize(4032, 3024)).toEqual({ width: 1568, height: 1176 })
    expect(scaledSize(3024, 4032)).toEqual({ width: 1176, height: 1568 })
    expect(scaledSize(800, 600)).toEqual({ width: 800, height: 600 })
    expect(FILE_LIMITS.imageEdge).toBe(1568)
  })
})

describe("how many files may still be added", () => {
  it("is 3 per message, within what is left of the search's 6", () => {
    expect(roomFor(0, 0)).toBe(3)
    expect(roomFor(2, 0)).toBe(1)
    expect(roomFor(0, 4)).toBe(2)
    expect(roomFor(1, 5)).toBe(0)
  })
})

describe("labels", () => {
  it("shows a file's own name, short, and 'Photo' for a pasted image", () => {
    expect(fileLabel("wishlist.pdf", "pdf")).toBe("wishlist.pdf")
    expect(fileLabel("image.png", "image")).toBe("Photo")
    expect(fileLabel("", "text")).toBe("Text file")
    expect(fileLabel(`${"a".repeat(50)}.pdf`, "pdf")).toHaveLength(38)
  })
})

describe("pasting", () => {
  it("takes the clipboard's files, and nothing from a text paste", () => {
    const photo = new File(["x"], "image.png", { type: "image/png" })
    expect(filesFromClipboard({ files: [photo], items: [] } as unknown as DataTransfer)).toEqual([photo])
    expect(filesFromClipboard({ files: [], items: [{ kind: "file", getAsFile: () => photo }] } as unknown as DataTransfer)).toEqual([photo])
    expect(filesFromClipboard({ files: [], items: [{ kind: "string", getAsFile: () => null }] } as unknown as DataTransfer)).toEqual([])
    expect(filesFromClipboard(null)).toEqual([])
  })
})

describe("the request", () => {
  it("is JSON without files, and multipart with the request part and one part per file with them", async () => {
    const json = requestBody({ message: "Mama", locale: { language: "de" } })
    expect(json.headers["content-type"]).toBe("application/json")
    expect(JSON.parse(json.body as string)).toEqual({ message: "Mama", locale: { language: "de" } })

    const multipart = requestBody({ message: "", locale: { language: "de" } }, [
      { file: new Blob(["a"], { type: "image/jpeg" }), name: "regal.jpg" },
      { file: new Blob(["b"], { type: "application/pdf" }), name: "club.pdf" },
    ])
    // The browser sets the boundary itself.
    expect(multipart.headers["content-type"]).toBeUndefined()
    const form = multipart.body as FormData
    expect(JSON.parse(form.get("request") as string)).toEqual({ message: "", locale: { language: "de" } })
    expect((form.getAll("file") as File[]).map((f) => f.name)).toEqual(["regal.jpg", "club.pdf"])
  })
})

describe("sent files in the conversation", () => {
  it("shows them on the message, counts them for the search, and leaves out files refused with their request", () => {
    const files = [
      { kind: "image" as const, name: "Photo" },
      { kind: "pdf" as const, name: "club.pdf" },
    ]
    const sent = run([{ type: "send", text: "", files }])
    expect(sent.items[0]).toEqual({ id: "f0", role: "user", text: "", files })
    expect(filesSent(sent.items)).toBe(2)
    const refused = run([{ type: "failed", message: "club.pdf hat mehr als 20 Seiten.", noRetry: true }], sent)
    expect(filesSent(refused.items)).toBe(0)
    // Sending the words again would leave the files out, so there is no Try again.
    expect(refused.items.at(-1)).toMatchObject({ role: "notice", retry: undefined })
  })
})

describe("note chips", () => {
  it("shows the newest four notes, each its own chip, short, and correctable", () => {
    const chips = contextChips({
      language: "en",
      notes: ["Plays the saxophone", "Collects vinyl", "Loves film cameras", "Wishlist: Kindle Paperwhite signature edition, 149,99 €", "Lots of houseplants"],
    })
    const notes = chips.filter((c) => c.key.startsWith("note-"))
    expect(notes.map((c) => c.label)).toEqual(["Collects vinyl", "Loves film cameras", "Wishlist: Kindle Paperwhite signature e…", "Lots of houseplants"])
    expect(notes[2].description).toBe("From what you shared: Wishlist: Kindle Paperwhite signature edition, 149,99 €. Correct it")
    expect(notes[0].prefill).toBe("About “Collects vinyl”: ")
  })
})
