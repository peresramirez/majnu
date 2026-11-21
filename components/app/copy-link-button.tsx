"use client"

import { useEffect, useState } from "react"
import { Check, Copy } from "lucide-react"
import { smallButton } from "./styles"

export function CopyLinkButton({ url, className = "" }: { url: string; className?: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(t)
  }, [copied])

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      // Clipboard blocked (older browsers, some in-app browsers): let them copy by hand.
      window.prompt("Copy this link", url)
    }
  }

  return (
    <button type="button" onClick={copy} className={`${smallButton} ${className}`}>
      {copied ? (
        <Check className="h-4 w-4 text-night-rose max-sm:hidden" aria-hidden="true" />
      ) : (
        <Copy className="h-4 w-4 max-sm:hidden" aria-hidden="true" />
      )}
      <span aria-live="polite">{copied ? "Copied" : "Copy link"}</span>
    </button>
  )
}
