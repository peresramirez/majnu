"use client"

// The attach button, the previews above the message box, and the overlay
// while files are dragged over the finder (issue #77). Used by the finder's
// two message boxes: the landing page's dialog and the app's Find a gift tab.
import { useEffect, useRef } from "react"
import { FileText, ImagePlus, Paperclip, X } from "lucide-react"
import { FILE_ACCEPT } from "@/lib/finder/file-rules"
import { fileLabel, type Attachment } from "./attachments"
import { focusRing } from "./styles"

// A 40px button beside the message box. On iPhone the picker offers the photo
// library, the camera and Files.
export function AttachButton({ onFiles, disabled }: { onFiles: (files: File[]) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <button
        type="button"
        aria-label="Add photos or files"
        aria-disabled={disabled}
        // Focus stays in the message box: on a phone the tab bar would come
        // back as the box loses focus and move this button mid-tap.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (!disabled) input.current?.click()
        }}
        className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-night-lilac transition-colors duration-200 ease-calm before:absolute before:-inset-0.5 before:content-[''] hover:bg-night-petal/[0.06] hover:text-night-petal aria-disabled:opacity-50 ${focusRing}`}
      >
        <Paperclip className="h-5 w-5" aria-hidden="true" />
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept={FILE_ACCEPT}
        tabIndex={-1}
        aria-hidden="true"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          // The same file can be picked again after it was removed.
          e.target.value = ""
          onFiles(files)
        }}
      />
    </>
  )
}

// Small previews above the message box, each with a button to remove it, and
// a line for a file that could not be added.
export function AttachmentTray({
  items,
  preparing,
  error,
  onRemove,
}: {
  items: Attachment[]
  preparing: boolean
  error: string | null
  onRemove: (id: string) => void
}) {
  const root = useRef<HTMLDivElement>(null)
  const form = useRef<HTMLFormElement | null>(null)
  // Where focus goes once a preview removed with the keyboard is gone: the
  // next preview's button, or the one before, or else the message box.
  const focusNext = useRef<string | null>(null)
  useEffect(() => {
    const target = focusNext.current
    if (target === null) return
    focusNext.current = null
    const button = target ? root.current?.querySelector<HTMLButtonElement>(`button[data-remove="${target}"]`) : null
    if (button) button.focus()
    else form.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus()
  }, [items])
  if (items.length === 0 && !preparing && !error) return null

  function removeAt(index: number, id: string, byKeyboard: boolean) {
    if (byKeyboard) {
      form.current = root.current?.closest("form") ?? null
      focusNext.current = items[index + 1]?.id ?? items[index - 1]?.id ?? ""
    }
    onRemove(id)
  }

  return (
    <div ref={root} className="pb-2 pt-1.5">
      {(items.length > 0 || preparing) && (
        <ul className="flex flex-wrap gap-2" aria-label="Files to send">
          {items.map((item, index) => {
            const label = fileLabel(item.name, item.kind)
            return (
              <li key={item.id} className="relative">
                {item.previewUrl ? (
                  // A local object URL of the scaled photo: next/image has nothing to optimise.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.previewUrl} alt={label} className="h-14 w-14 rounded-xl object-cover ring-1 ring-inset ring-night-petal/15" />
                ) : (
                  <span className="flex h-14 w-32 items-center gap-2 rounded-xl bg-night-velvet px-2.5 text-[12px] leading-tight text-night-petal ring-1 ring-inset ring-night-petal/15">
                    <FileText className="h-5 w-5 shrink-0 text-night-lilac" aria-hidden="true" />
                    <span className="line-clamp-2 [overflow-wrap:anywhere]">{label}</span>
                  </span>
                )}
                <button
                  type="button"
                  aria-label={`Remove ${label}`}
                  data-remove={item.id}
                  // detail is 0 for a click made with Enter or Space.
                  onClick={(e) => removeAt(index, item.id, e.detail === 0)}
                  className={`absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-night-plum text-night-petal ring-1 ring-night-petal/30 transition-colors duration-200 before:absolute before:-inset-2.5 before:content-[''] hover:bg-night-velvet ${focusRing}`}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </li>
            )
          })}
          {preparing && (
            <li className="flex h-14 w-14 items-center justify-center rounded-xl bg-night-velvet ring-1 ring-inset ring-night-petal/15">
              <ImagePlus className="h-5 w-5 text-night-lilac motion-safe:animate-pulse" aria-hidden="true" />
              <span className="sr-only">Preparing your file…</span>
            </li>
          )}
        </ul>
      )}
      <p className="text-[13px] leading-snug text-night-rose empty:hidden [&:not(:empty)]:mt-1.5" aria-live="polite">
        {error ?? ""}
      </p>
    </div>
  )
}

// Over the finder while files are dragged onto it.
export function DropOverlay({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-[20px] border-2 border-dashed border-night-rose/70 bg-night-plum/85 backdrop-blur-sm"
    >
      <p className="flex items-center gap-2 text-[15px] font-semibold text-night-petal">
        <Paperclip className="h-5 w-5" aria-hidden="true" />
        Drop photos or files to share them with Majnu
      </p>
    </div>
  )
}
