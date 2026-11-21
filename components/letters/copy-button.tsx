"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

// Copies text, falling back to a hidden textarea where the Clipboard API is
// blocked (some in-app browsers). Returns whether it worked.
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fall through to the textarea.
  }
  try {
    const area = document.createElement("textarea")
    area.value = text
    area.setAttribute("readonly", "")
    area.style.position = "fixed"
    area.style.opacity = "0"
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand("copy")
    area.remove()
    return ok
  } catch {
    return false
  }
}

// A button that copies `text` and says "Copied" for two seconds.
export function CopyButton({
  text,
  label = "Copy",
  copiedLabel = "Copied",
  className = "",
  onCopied,
  children,
}: {
  text: string
  label?: string
  copiedLabel?: string
  className?: string
  onCopied?: () => void
  children?: ReactNode
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle")
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  async function onClick() {
    const ok = await copyText(text)
    setState(ok ? "copied" : "failed")
    if (ok) onCopied?.()
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setState("idle"), 2000)
  }

  return (
    <button type="button" onClick={onClick} className={className} data-state={state}>
      {children}
      <span aria-live="polite">{state === "copied" ? copiedLabel : state === "failed" ? "Select and copy" : label}</span>
    </button>
  )
}
