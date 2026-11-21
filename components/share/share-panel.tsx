"use client"

// Share a letter's link: copy, QR code (with PNG and SVG downloads), WhatsApp,
// and the phone's own share sheet where there is one. Part of the contract.
// `locked` shows "create a free account" instead of the link (for a gift that
// needs an account to send, such as a calendar made by a guest), and
// `onUnlock` starts the sign-up. Nothing in Majnu is locked behind a payment.
// Used inside the signed-in app, on the night palette.
import { useEffect, useMemo, useState } from "react"
import { MoonPhase } from "@/components/brand/moon-phase"
import { CopyButton } from "@/components/letters/copy-button"
import { downloadBlob, qrMatrix, qrPath, qrPng, qrSvg } from "./qr"

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-night-rose"
const SHARE_TEXT = "I made something for you."

function QrImage({ text, className = "", label }: { text: string; className?: string; label?: string }) {
  const { path, size } = useMemo(() => {
    const m = qrMatrix(text)
    return { path: qrPath(m), size: m.length }
  }, [text])
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      shapeRendering="crispEdges"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={path} fill="currentColor" />
    </svg>
  )
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2a9.9 9.9 0 0 0-8.5 15l-1.4 5 5.1-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"
      />
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" aria-hidden="true">
      <path d="M10 13V3M6.5 6.5 10 3l3.5 3.5M4 11v4.5A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5V11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function LockedPanel({ onUnlock }: { onUnlock?: () => void }) {
  return (
    <section aria-label="Share" className="overflow-hidden rounded-[22px] bg-night-velvet p-5 text-night-petal ring-1 ring-white/5">
      <div className="flex items-start gap-4">
        <div className="relative shrink-0 rounded-xl bg-night-petal/90 p-2 text-night-plum">
          <QrImage text="https://majnu.app" className="h-16 w-16 opacity-60 blur-[3px]" />
          <span className="absolute inset-0 flex items-center justify-center">
            <MoonPhase lit={1} size={26} className="text-night-rose drop-shadow" />
          </span>
        </div>
        <div className="min-w-0">
          <p className="font-display text-[22px] leading-tight">Create a free account to send it</p>
          <p className="mt-1.5 text-[14px] leading-relaxed text-night-lilac">
            It is opened day after day, so it lives in an account. Creating one is free, and everything you made comes with you.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onUnlock}
        className={`mt-5 w-full rounded-full bg-night-rose px-5 py-3.5 text-[15px] font-semibold text-night-plum transition-opacity duration-200 hover:opacity-90 ${focusRing}`}
      >
        Create a free account
      </button>
    </section>
  )
}

export function SharePanel({ url, locked = false, onUnlock }: { url: string; locked?: boolean; onUnlock?: () => void }) {
  const [canShare, setCanShare] = useState(false)
  const [saving, setSaving] = useState<"png" | "svg" | null>(null)

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function")
  }, [])

  if (locked) return <LockedPanel onUnlock={onUnlock} />

  const shownUrl = url.replace(/^https?:\/\//, "")
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`${SHARE_TEXT} ${url}`)}`
  const fileBase = `majnu-${(shownUrl.split("/").pop() || "gift").replace(/[^a-zA-Z0-9-]/g, "")}`

  async function nativeShare() {
    try {
      await navigator.share({ text: SHARE_TEXT, url })
    } catch {
      // Closed the share sheet, or sharing is blocked: nothing to do.
    }
  }

  async function savePng() {
    setSaving("png")
    try {
      const blob = await qrPng(url)
      if (blob) downloadBlob(blob, `${fileBase}-qr.png`)
    } finally {
      setSaving(null)
    }
  }

  function saveSvg() {
    downloadBlob(new Blob([qrSvg(url)], { type: "image/svg+xml" }), `${fileBase}-qr.svg`)
  }

  const secondary = `flex items-center justify-center gap-2 rounded-full px-4 py-3 text-[14px] font-semibold text-night-petal ring-1 ring-inset ring-night-petal/25 transition-colors duration-200 hover:bg-white/5 ${focusRing}`

  return (
    <section aria-label="Share" className="rounded-[22px] bg-night-velvet p-4 text-night-petal ring-1 ring-white/5 sm:p-5">
      <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-night-lilac">Send the link</p>

      <div className="mt-3 flex items-center gap-2 rounded-full bg-night-plum p-1.5 pl-4 ring-1 ring-white/10">
        <a href={url} target="_blank" rel="noopener noreferrer" className={`min-w-0 flex-1 truncate rounded text-[15px] text-night-petal ${focusRing}`} title={url}>
          {shownUrl}
        </a>
        <CopyButton
          text={url}
          label="Copy link"
          copiedLabel="Copied"
          className={`shrink-0 rounded-full bg-night-rose px-4 py-2.5 text-[14px] font-semibold text-night-plum transition-opacity duration-200 hover:opacity-90 ${focusRing}`}
        />
      </div>

      <div className={`mt-3 grid gap-2 ${canShare ? "grid-cols-2" : "grid-cols-1"}`}>
        <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={secondary}>
          <WhatsAppIcon />
          WhatsApp
        </a>
        {canShare ? (
          <button type="button" onClick={nativeShare} className={secondary}>
            <ShareIcon />
            Share
          </button>
        ) : null}
      </div>

      <div className="mt-4 flex items-center gap-4 rounded-2xl bg-night-plum/70 p-3.5">
        <div className="shrink-0 rounded-xl bg-white p-2.5 text-night-plum">
          <QrImage text={url} className="h-[104px] w-[104px]" label={`QR code for ${shownUrl}`} />
        </div>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">QR code</p>
          <p className="mt-0.5 text-[13px] leading-snug text-night-lilac">Print it in a card, or let them scan it from your phone.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={savePng}
              disabled={saving === "png"}
              className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ring-1 ring-inset ring-night-petal/25 hover:bg-white/5 disabled:opacity-60 ${focusRing}`}
            >
              Save PNG
            </button>
            <button
              type="button"
              onClick={saveSvg}
              className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ring-1 ring-inset ring-night-petal/25 hover:bg-white/5 ${focusRing}`}
            >
              Save SVG
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
