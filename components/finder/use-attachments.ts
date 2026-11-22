"use client"

// The files waiting in the finder's message box (issue #77): added with the
// attach button, a paste or a drop, shown as previews the visitor can remove,
// and sent with the next message. At most 3 per message, and no more than the
// search has left of its 6.
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react"
import { FILE_LIMITS } from "@/lib/finder/file-rules"
import { FILE_TEXTS, hasDraggedFiles, prepareFile, roomFor, type Attachment } from "./attachments"

let nextId = 0

export function useAttachments(sentInSearch: number) {
  const [items, setItems] = useState<Attachment[]>([])
  const [preparing, setPreparing] = useState(0)
  const [error, setError] = useState<string | null>(null)
  // Files added or still being prepared, for adds that come in quick succession.
  const countRef = useRef(0)
  const itemsRef = useRef<Attachment[]>([])
  itemsRef.current = items

  // Previews are object URLs: give them back when the box goes away.
  useEffect(() => () => itemsRef.current.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl)), [])

  const add = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return
      const room = roomFor(countRef.current, sentInSearch)
      // Which limit stops the rest: the search's 6, or the message's 3.
      const searchBinds = FILE_LIMITS.perSession - sentInSearch < FILE_LIMITS.perMessage
      const overLimit = searchBinds ? FILE_TEXTS.sessionFull : FILE_TEXTS.tooMany
      if (room === 0) {
        setError(overLimit)
        return
      }
      const taken = files.slice(0, room)
      setError(files.length > room ? overLimit : null)
      countRef.current += taken.length
      setPreparing((n) => n + taken.length)
      const results = await Promise.all(taken.map((file) => prepareFile(file)))
      setPreparing((n) => n - taken.length)
      const ready: Attachment[] = []
      let problem: string | null = null
      let bytes = itemsRef.current.reduce((sum, item) => sum + item.file.size, 0)
      for (const result of results) {
        if (!result.ok) {
          problem ??= result.error
          countRef.current--
          continue
        }
        if (bytes + result.attachment.file.size > FILE_LIMITS.messageBytes) {
          problem ??= FILE_TEXTS.together
          countRef.current--
          continue
        }
        bytes += result.attachment.file.size
        const { attachment } = result
        ready.push({
          ...attachment,
          id: `a${nextId++}`,
          ...(attachment.kind === "image" ? { previewUrl: URL.createObjectURL(attachment.file) } : {}),
        })
      }
      if (problem) setError(problem)
      if (ready.length > 0) setItems((current) => [...current, ...ready])
    },
    [sentInSearch],
  )

  const remove = useCallback((id: string) => {
    setItems((current) => {
      const gone = current.find((item) => item.id === id)
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl)
      if (gone) countRef.current--
      return current.filter((item) => item.id !== id)
    })
    setError(null)
  }, [])

  // After sending, or for a new search.
  const clear = useCallback(() => {
    itemsRef.current.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl))
    countRef.current = 0
    setItems([])
    setError(null)
  }, [])

  return { items, preparing: preparing > 0, error, add, remove, clear }
}

export type Attachments = ReturnType<typeof useAttachments>

// Dropping files anywhere on the finder (desktop). `dragging` shows the overlay.
export function useFileDrop(onFiles: (files: File[]) => void, enabled: boolean) {
  const [dragging, setDragging] = useState(false)
  const depth = useRef(0)
  const handlers = {
    onDragEnter: (e: DragEvent) => {
      if (!enabled || !hasDraggedFiles(e.dataTransfer)) return
      e.preventDefault()
      depth.current++
      setDragging(true)
    },
    onDragOver: (e: DragEvent) => {
      if (!enabled || !hasDraggedFiles(e.dataTransfer)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = "copy"
    },
    onDragLeave: (e: DragEvent) => {
      if (!enabled || !hasDraggedFiles(e.dataTransfer)) return
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setDragging(false)
    },
    onDrop: (e: DragEvent) => {
      if (!enabled || !hasDraggedFiles(e.dataTransfer)) return
      e.preventDefault()
      depth.current = 0
      setDragging(false)
      onFiles(Array.from(e.dataTransfer.files))
    },
  }
  return { dragging: enabled && dragging, handlers }
}
