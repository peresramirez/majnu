"use client"

import Link from "next/link"
import { useState } from "react"
import { ArrowLeft, ArrowUpRight } from "lucide-react"
import { MoonPhase } from "@/components/brand/moon-phase"
import { WaxingMoon } from "@/components/app/waxing-moon"
import { eyebrow, focusRing } from "@/components/app/styles"
import { SharePanel } from "@/components/share/share-panel"
import { AudioNoteRecorder } from "@/components/voice/audio-note-recorder"
import { MakeItUnique } from "@/components/wrapper/make-it-unique"
import { site } from "@/lib/site"
import { DraftSheet } from "./draft-sheet"
import type { DraftView } from "./draft-state"

// The gift as the recipient will see it, at phone width, with the share panel
// under it and "Make it unique" (the personalised wrapper, €2.99 once) under
// that. Beside the chat from lg up; on phones it replaces the chat while
// "Preview" is on.
//
// While Majnu writes (issue #30), the draft sheet takes the frame's place: in
// place of the empty state for a new gift, and over the preview while it is
// changed. It stays until the reloaded preview of the saved content has loaded,
// so the frame is never blank and never shows an unsaved draft as the page.
export function PreviewPane({
  letterId,
  slug,
  linkFailed,
  hasContent,
  version,
  recipientName,
  draft,
  onPreviewShown,
  onBack,
  className = "",
}: {
  letterId: string | null
  slug: string | null
  // The link could not be looked up; it is still in My gifts.
  linkFailed: boolean
  hasContent: boolean
  version: number
  recipientName: string | null
  draft: DraftView | null
  // The preview of the saved content has loaded, so a saved draft can go.
  onPreviewShown: () => void
  onBack: () => void
  className?: string
}) {
  const ready = hasContent && letterId !== null
  const src = ready ? `/create/${encodeURIComponent(letterId)}/preview` : null
  // Bumped when the voice note changes, so the preview reloads with it.
  const [noteVersion, setNoteVersion] = useState(0)
  const frameVersion = version || noteVersion ? `${version}.${noteVersion}` : ""

  return (
    <aside aria-label="Preview" className={`min-h-0 flex-col bg-night-deep/70 lg:border-l lg:border-night-petal/10 ${className}`}>
      <div className="flex flex-none items-center justify-between gap-3 px-4 py-3 lg:px-6 lg:py-4">
        <button
          type="button"
          onClick={onBack}
          className={`inline-flex items-center gap-2 rounded-full py-2 pr-3 text-sm font-semibold text-night-lilac hover:text-night-petal lg:hidden ${focusRing}`}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to chat
        </button>
        <p className={`hidden lg:block ${eyebrow}`}>{recipientName ? `How ${recipientName} will see it` : "Preview"}</p>
        {src && (
          <a
            href={src}
            target="_blank"
            rel="noopener"
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-night-lilac hover:text-night-petal ${focusRing}`}
          >
            Full screen <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 lg:px-6">
        {src ? (
          <>
            <PreviewFrame
              key={frameVersion}
              src={frameVersion ? `${src}?v=${frameVersion}` : src}
              title={recipientName ? `Preview of the gift for ${recipientName}` : "Preview of your gift"}
              draft={draft}
              onLoaded={onPreviewShown}
            />
            <div className="mx-auto mt-5 w-full max-w-[400px]">
              {slug ? (
                <SharePanel url={`${site.url}/l/${slug}`} />
              ) : linkFailed ? (
                <p className="text-sm leading-relaxed text-night-lilac">
                  We couldn&apos;t get the link just now. You&apos;ll find it in{" "}
                  <Link href="/dashboard/gifts" className={`rounded font-semibold text-night-petal underline underline-offset-4 ${focusRing}`}>
                    My gifts
                  </Link>
                  .
                </p>
              ) : (
                <p role="status" className="flex items-center gap-2 text-sm text-night-lilac">
                  <WaxingMoon size={16} className="text-night-rose" /> Getting your link…
                </p>
              )}
              {/* A voice note for the recipient. It asks the server for the saved one and hides itself on calendars. */}
              {letterId && (
                <AudioNoteRecorder key={letterId} letterId={letterId} recipientName={recipientName} onChange={() => setNoteVersion((v) => v + 1)} className="mt-5" />
              )}
              {/* Asks the server whether this gift can have one (letters only) and how far a paid one is. */}
              {letterId && <MakeItUnique letterId={letterId} returnTo={`/create/${letterId}`} refreshKey={version} className="mt-4" />}
            </div>
          </>
        ) : draft ? (
          <div className={frameBox}>
            <DraftSheet draft={draft} />
          </div>
        ) : (
          <div className="mx-auto flex h-full max-w-[320px] flex-col items-center justify-center py-16 text-center">
            <MoonPhase lit={0} size={44} className="text-night-lilac" />
            <p className="mt-5 font-display text-2xl text-night-petal">Your gift appears here</p>
            <p className="mt-2 text-[15px] leading-relaxed text-night-lilac">
              Once Majnu has what it needs, you will see the page exactly as they will, and get the link to send.
            </p>
          </div>
        )}
      </div>
    </aside>
  )
}

// The phone-sized frame the preview and the draft share.
const frameBox =
  "relative mx-auto h-[68dvh] min-h-[420px] w-full max-w-[400px] overflow-hidden rounded-[28px] bg-night-plum ring-1 ring-night-petal/10 lg:h-[min(780px,calc(100dvh-17rem))]"

function PreviewFrame({
  src,
  title,
  draft,
  onLoaded,
}: {
  src: string
  title: string
  draft: DraftView | null
  onLoaded: () => void
}) {
  const [loaded, setLoaded] = useState(false)
  return (
    <div className={frameBox}>
      {draft && (
        <div className="absolute inset-0 z-10">
          <DraftSheet draft={draft} />
        </div>
      )}
      {!loaded && !draft && (
        <div className="absolute inset-0 grid place-items-center" role="status">
          <span className="flex flex-col items-center gap-3 text-sm text-night-lilac">
            <WaxingMoon size={28} className="text-night-rose" />
            Opening the preview…
          </span>
        </div>
      )}
      <iframe
        src={src}
        title={title}
        // Under the draft, the older page is out of reach for keyboards and screen readers.
        inert={draft ? true : undefined}
        onLoad={() => {
          setLoaded(true)
          onLoaded()
        }}
        className={`relative h-full w-full border-0 transition-opacity duration-300 ease-calm ${loaded ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  )
}
