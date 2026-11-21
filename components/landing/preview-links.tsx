"use client"

import { useState, type MouseEvent, type ReactNode } from "react"
import { PreviewDialog } from "@/components/finder/preview-dialog"
import { isPlainClick } from "./plain-click"

type Preview = { src: string; title: string }

// Links marked `data-preview="<title>"` inside open their page in a dialog over
// the landing page instead of leaving it. The links stay real links, server-
// rendered with their cards: without JavaScript, or with a modifier key or a
// middle click, they open the page as usual.
export function PreviewLinks({ children, className }: { children: ReactNode; className?: string }) {
  const [preview, setPreview] = useState<Preview | null>(null)

  function onClick(e: MouseEvent<HTMLDivElement>) {
    if (!isPlainClick(e)) return
    const link = (e.target as Element).closest<HTMLAnchorElement>("a[data-preview]")
    const src = link?.getAttribute("href")
    if (!link || !src || !e.currentTarget.contains(link)) return
    e.preventDefault()
    // Safari does not focus a clicked link; the dialog gives focus back to it.
    link.focus()
    setPreview({ src, title: link.dataset.preview || "Preview" })
  }

  return (
    <div className={className} onClick={onClick}>
      {children}
      <PreviewDialog src={preview?.src ?? null} title={preview?.title ?? ""} onClose={() => setPreview(null)} />
    </div>
  )
}
