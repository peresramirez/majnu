"use client"

import { forwardRef, useLayoutEffect, useRef, useImperativeHandle, type KeyboardEvent } from "react"
import { ArrowUp, LayoutTemplate, X } from "lucide-react"
import { focusRing } from "@/components/app/styles"
import { VoiceButton } from "@/components/voice/voice-button"
import type { TemplateMeta } from "@/lib/letters/templates"
import { canSendMessage, sendsOnEnter, withVoiceText } from "./chat-state"
import { TemplateIcon } from "./template-bits"

const MAX_HEIGHT = 168 // about six lines, then the field scrolls

type ComposerProps = {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  // A reply is streaming: typing is fine, sending waits.
  busy: boolean
  template: TemplateMeta | null
  onRemoveTemplate: () => void
  onOpenTemplates: () => void
  placeholder: string
}

// The message box: Enter sends, Shift+Enter starts a new line, and phone
// keyboards show a Send key. The Template button opens the template cards.
export const Composer = forwardRef<HTMLTextAreaElement, ComposerProps>(function Composer(
  { value, onChange, onSend, busy, template, onRemoveTemplate, onOpenTemplates, placeholder },
  ref,
) {
  const field = useRef<HTMLTextAreaElement>(null)
  useImperativeHandle(ref, () => field.current as HTMLTextAreaElement)
  const canSend = canSendMessage(busy, value, template?.name ?? null)

  // Grow with the text up to MAX_HEIGHT.
  useLayoutEffect(() => {
    const el = field.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`
  }, [value])

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (!sendsOnEnter({ key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing })) return
    e.preventDefault()
    if (canSend) onSend()
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (canSend) onSend()
      }}
      className="rounded-[26px] bg-night-velvet ring-1 ring-inset ring-night-petal/15 transition-shadow duration-200 ease-calm focus-within:ring-night-rose/60"
    >
      {template && (
        <div className="px-3 pt-3">
          <span className="inline-flex max-w-full items-center gap-2 rounded-full bg-night-plum py-1 pl-3 pr-1 text-sm text-night-petal ring-1 ring-inset ring-night-rose/40">
            <span className="text-night-rose">
              <TemplateIcon id={template.id} className="h-4 w-4" />
            </span>
            <span className="truncate">{template.name}</span>
            <button
              type="button"
              onClick={onRemoveTemplate}
              aria-label={`Remove the ${template.name} template`}
              className={`grid h-7 w-7 flex-none place-items-center rounded-full text-night-lilac hover:bg-night-petal/10 hover:text-night-petal ${focusRing}`}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </span>
        </div>
      )}

      <label htmlFor="composer" className="sr-only">
        Message to Majnu
      </label>
      <textarea
        id="composer"
        ref={field}
        data-composer=""
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        enterKeyHint="send"
        autoComplete="off"
        className="block max-h-[168px] w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-base leading-relaxed text-night-petal placeholder:text-night-lilac/70 focus:outline-none"
      />

      <div className="flex items-center justify-between gap-3 px-2 pb-2 pt-1">
        <button
          type="button"
          onClick={onOpenTemplates}
          aria-haspopup="dialog"
          className={`inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold text-night-lilac transition-colors duration-200 ease-calm hover:bg-night-petal/5 hover:text-night-petal ${focusRing}`}
        >
          <LayoutTemplate className="h-[18px] w-[18px]" aria-hidden="true" />
          Template
        </button>
        <div className="flex items-center gap-1">
          <VoiceButton
            onText={(text) => {
              // Added to what is already there, for the sender to check and send.
              onChange(withVoiceText(value, text))
              requestAnimationFrame(() => {
                const el = field.current
                if (!el) return
                el.focus()
                el.setSelectionRange(el.value.length, el.value.length)
              })
            }}
          />
          <button
            type="submit"
            disabled={!canSend}
            aria-label={busy ? "Majnu is still replying" : "Send"}
            // Keep the keyboard open on phones: the field keeps focus when Send is tapped.
            onMouseDown={(e) => e.preventDefault()}
            className={`grid h-10 w-10 place-items-center rounded-full bg-night-rose text-night-plum transition-colors duration-200 ease-calm hover:bg-[#F1C4A9] disabled:cursor-not-allowed disabled:bg-night-petal/10 disabled:text-night-lilac/60 ${focusRing}`}
          >
            <ArrowUp className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
      </div>
    </form>
  )
})
