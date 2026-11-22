"use client"

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react"
import Link from "next/link"
import { ArrowLeft, ArrowRight, Maximize2 } from "lucide-react"
import { LETTERS_CHAT } from "@/components/app/tabs"
import { MoonPhase } from "@/components/brand/moon-phase"
import { TemplateCard } from "@/components/letters/template-card"
import { SharePanel } from "@/components/share/share-panel"
import { AudioNoteRecorder } from "@/components/voice/audio-note-recorder"
import { MakeItUnique } from "@/components/wrapper/make-it-unique"
import type { WrapTemplateId } from "@/lib/finder/events"
import { wrapTemplatesFor } from "@/lib/finder/wrap-templates"
import { getTemplate } from "@/lib/letters/templates"
import { createClient } from "@/lib/supabase/client"
import {
  NAME_REQUIRED,
  WRAP_LIMITS,
  noticeRole,
  wrapAccount,
  wrapExchange,
  type FinderItem,
  type WrapAccount,
  type WrapDetails,
  type WrapState,
} from "./finder-state"
import { ProductImage } from "./gift-option-card"
import { PreviewDialog } from "./preview-dialog"
import { RichText } from "./rich-text"
import { chip, focusRing, primaryButton, quietLink, secondaryButton, textLink } from "./styles"
import { shopName } from "./urls"
import type { Finder } from "./use-finder"

type OpenWrap = Exclude<WrapState, { stage: "closed" }>

type Props = {
  finder: Finder
  wrap: OpenWrap
}

// The wrap form and its buttons live apart: the form scrolls inside the
// finder, the buttons stay in a bar at the bottom of it (WrapFooter).
export const WRAP_FORM_ID = "finder-wrap-form"

// What the message box suggests on the wrap step.
export const WRAP_PLACEHOLDER = "Tell Majnu who it's for, or ask about the gift"

// The scrolling area around the wrap step, in the dialog and the inline panel.
export const SCROLLER_ATTRIBUTE = "data-finder-scroller"

const field = `mt-1.5 block w-full rounded-2xl bg-night-plum px-4 py-3 text-[16px] text-night-petal ring-1 ring-inset ring-night-petal/15 placeholder:text-night-lilac/60 transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-night-rose aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-night-rose disabled:opacity-60`

const optional = <span className="font-normal text-night-lilac">(optional)</span>

const FIELD_WORDS: Record<keyof WrapDetails, string> = {
  recipientName: "their name",
  senderName: "your name",
  note: "the note",
  giftCode: "the gift code",
}

// "their name and your name", "their name, the note and the gift code".
function listOf(words: string[]): string {
  return words.length <= 1 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" onClick={onBack} className={`inline-flex items-center gap-1.5 rounded-full py-1 text-sm font-semibold text-night-lilac hover:text-night-petal ${focusRing}`}>
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Back to the gift ideas
    </button>
  )
}

// The bar under the wrap form: the gift being wrapped, any error, and what to
// do next: Next on step 1, Back and Wrap on step 2. It sits outside the
// scrolling area, so it is always in view.
// `last` is false when the message box sits below it, which then keeps clear
// of the phone's home indicator instead.
export function WrapFooter({ wrap, onNext, onPrevious, last = true }: { wrap: OpenWrap; onNext: () => void; onPrevious: () => void; last?: boolean }) {
  const busy = wrap.stage === "wrapping"
  const details = wrap.stage === "wrapping" || (wrap.stage === "choose" && wrap.step === "details")
  const { option } = wrap
  // The price first: on a phone the end of this line is cut off.
  const meta = [option.price, shopName(option)].filter(Boolean).join(" · ")
  const error = wrap.stage === "choose" ? wrap.error : undefined
  return (
    <div data-wrap-footer="" className={`shrink-0 border-t border-night-petal/10 bg-night-plum pt-2.5 ${last ? "pb-[max(10px,var(--safe-bottom))]" : "pb-2.5"}`}>
      {/* Same padding as the content above, so the edges line up. */}
      <div className="px-4 sm:px-5">
        {error && (
          <p role="alert" className="mb-2.5 text-sm leading-relaxed text-night-petal">
            {error}{" "}
            {wrap.stage === "choose" && wrap.reason === "signin_required" && (
              <Link href="/signup" className={textLink}>
                Sign up
              </Link>
            )}
          </p>
        )}
        <div className="flex items-center gap-3">
          {/* On step 2 a phone needs the room for Back and Wrap. */}
          <ProductImage src={option.imageUrl} className={`aspect-square w-10 shrink-0 rounded-xl ${details ? "max-sm:hidden" : ""}`} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-snug text-night-petal">{option.title}</p>
            <p className="truncate text-xs leading-snug text-night-lilac" aria-live="polite">
              {busy ? "Majnu is writing the page…" : meta}
            </p>
          </div>
          {details ? (
            <>
              <button type="button" onClick={onPrevious} disabled={busy} className={`${secondaryButton} shrink-0 px-4`}>
                Back
              </button>
              <button type="submit" form={WRAP_FORM_ID} className={`${primaryButton} shrink-0`} aria-disabled={busy}>
                {busy ? (
                  <>
                    <MoonPhase lit={0.5} size={18} className="motion-safe:animate-[moon-breathe_2.4s_ease-in-out_infinite]" />
                    <span className="hidden sm:inline">Wrapping…</span>
                    <span className="sr-only sm:hidden">Wrapping</span>
                  </>
                ) : (
                  "Wrap the gift"
                )}
              </button>
            </>
          ) : (
            <button type="button" onClick={onNext} className={`${primaryButton} shrink-0`}>
              Next
              <ArrowRight className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// What the visitor and Majnu said since the wrap step opened (issue #70): the
// newest message and the reply to it, with any question's answers to tap.
// The whole conversation is still there behind "Back to the gift ideas".
function WrapExchange({ items, streaming, status, onSend }: { items: FinderItem[]; streaming: boolean; status: string | null; onSend: (text: string) => void }) {
  if (items.length === 0) return null
  const waiting = streaming && items[items.length - 1]?.role === "user"
  return (
    <div className="mt-4 space-y-2 rounded-2xl bg-night-velvet/70 px-4 py-3 text-[15px] leading-relaxed ring-1 ring-inset ring-night-petal/10" aria-label="Your message to Majnu and the reply">
      {items.map((item) => {
        switch (item.role) {
          case "user":
            return (
              <p key={item.id} className="text-sm text-night-lilac">
                <span className="font-semibold text-night-petal">You: </span>
                {item.text}
              </p>
            )
          case "assistant":
            return (
              <div key={item.id} className="text-night-petal/95">
                <span className="sr-only">Majnu: </span>
                <RichText text={item.text} />
              </div>
            )
          case "question":
            return (
              <div key={item.id}>
                <p className="text-night-petal/95">
                  <span className="sr-only">Majnu asks: </span>
                  {item.text}
                </p>
                {item.suggestions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Suggested answers">
                    {item.suggestions.map((s) => (
                      <button key={s} type="button" className={chip} disabled={streaming} onClick={() => onSend(s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          case "notice":
            return (
              <p key={item.id} role={noticeRole(item)} className="text-night-petal">
                {item.message}
              </p>
            )
          default:
            return null
        }
      })}
      {waiting && (
        <p aria-hidden="true" className="text-night-lilac motion-safe:animate-[moon-breathe_2.4s_ease-in-out_infinite]">
          {status ?? "Majnu is writing…"}
        </p>
      )}
    </div>
  )
}

// Whether the finder's session is a guest (anonymous) account or a signed-up
// one: the session is the one the finder made or found before the first
// search (anonymous-session.ts), read from this browser without a request.
// Only the wording depends on it. Null until it is known, so a member never
// sees the guest's sentence flash by.
function useAccount(): WrapAccount | null {
  const [account, setAccount] = useState<WrapAccount | null>(null)
  useEffect(() => {
    let cancelled = false
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (!cancelled) setAccount(wrapAccount(data.session?.user))
      })
      .catch(() => {
        if (!cancelled) setAccount("guest")
      })
    return () => {
      cancelled = true
    }
  }, [])
  return account
}

// Under the share panel: where the gift is kept, and calendars. A guest's
// gift lives in this browser until they sign up; a member's is in My gifts.
function KeepingNote({ account }: { account: WrapAccount | null }) {
  if (!account) return null
  if (account === "member") {
    return (
      <div className="space-y-2 text-sm leading-relaxed text-night-lilac">
        <p>
          This gift is in{" "}
          <Link href="/dashboard/gifts" className={quietLink}>
            My gifts
          </Link>
          , where you will see when they open it.
        </p>
        <p>
          Want to send an advent calendar instead?{" "}
          {/* As the Create tab's "Make a calendar": the letters chat with the calendar attached. */}
          <Link href={`${LETTERS_CHAT}?template=advent-classic`} className={quietLink}>
            Make a calendar
          </Link>
          .
        </p>
      </div>
    )
  }
  return (
    <div className="space-y-2 text-sm leading-relaxed text-night-lilac">
      <p>
        This gift is kept in this browser.{" "}
        <Link href="/signup" className={quietLink}>
          Sign up to keep your gifts
        </Link>{" "}
        on any phone or computer.
      </p>
      <p>Want to send an advent calendar instead? Calendars need an account.</p>
    </div>
  )
}

// The page they will open, in a phone-shaped frame. A quiet moon shows until
// it has loaded, so the frame is never an empty box.
function PreviewFrame({ src }: { src: string }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <div className="relative h-[min(560px,68svh)] overflow-hidden rounded-[22px] bg-night-deep ring-1 ring-inset ring-night-petal/15 md:h-auto md:min-h-0 md:flex-1">
      {!loaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-night-lilac" aria-hidden="true">
          <MoonPhase lit={0.5} size={28} className="text-night-rose motion-safe:animate-[moon-breathe_2.4s_ease-in-out_infinite]" />
          <span className="text-sm">Opening the preview…</span>
        </div>
      )}
      <iframe
        src={src}
        title="Preview of the gift"
        onLoad={() => setLoaded(true)}
        className={`absolute inset-0 h-full w-full transition-opacity duration-500 ease-calm ${loaded ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  )
}

// Wrapping the chosen gift in two steps (issue #71): 1. the design, then Next;
// 2. their name, your name, a note and the gift code, then Wrap. Then the page
// as they will see it, and the link to send.
export function WrapView({ finder, wrap }: Props) {
  const { state, chooseTemplate, nextStep, previousStep, editDetails, wrapGift, backToIdeas, send, transport } = finder
  // The finished page, larger, in a dialog over the finder.
  const [enlarged, setEnlarged] = useState<string | null>(null)
  // Bumped when the voice note changes, so the preview reloads with it.
  const [noteVersion, setNoteVersion] = useState(0)
  const account = useAccount()
  const busy = wrap.stage === "wrapping"
  // The party pop box only for a birthday or a party (issue #59).
  const templates = wrapTemplatesFor(state.context)
  const step = wrap.stage === "choose" ? wrap.step : "details"
  const exchange = wrapExchange(state.items, wrap.from)
  const nameInput = useRef<HTMLInputElement>(null)
  const exchangeBox = useRef<HTMLDivElement>(null)
  const top = useRef<HTMLDivElement>(null)
  // Set by Next and Back, so the new step's heading takes focus. A step
  // changed by Majnu's fill leaves focus in the message box.
  const focusHeading = useRef(false)

  // A new step starts at its top.
  const firstStep = useRef(true)
  useLayoutEffect(() => {
    if (firstStep.current) {
      firstStep.current = false
      return
    }
    const scroller = top.current?.closest<HTMLElement>(`[${SCROLLER_ATTRIBUTE}]`)
    scroller?.scrollTo({ top: 0 })
    // Next and Back in the bar below go away with their step, so focus would
    // fall to the page: the new heading takes it. Typing in the message box
    // keeps it there.
    const active = document.activeElement
    const fromBar = !active || active === document.body || active.closest("[data-wrap-footer]") !== null
    if (focusHeading.current || fromBar) {
      focusHeading.current = false
      top.current?.querySelector<HTMLElement>("[data-step-heading]")?.focus({ preventScroll: true })
    }
  }, [step])

  // A message sent from the wrap step, and its reply, come into view.
  const exchangeSize = exchange.length
  useEffect(() => {
    const box = exchangeBox.current
    const scroller = box?.closest<HTMLElement>(`[${SCROLLER_ATTRIBUTE}]`)
    if (!box || !scroller || exchangeSize === 0) return
    const boxTop = box.getBoundingClientRect().top - scroller.getBoundingClientRect().top
    if (boxTop < 0 || boxTop > scroller.clientHeight - 48) scroller.scrollTo({ top: scroller.scrollTop + boxTop - 16 })
  }, [exchangeSize])

  // Wrap without their name: the field says so and takes focus.
  const nameMissing = wrap.stage === "choose" && wrap.nameMissing === true
  useEffect(() => {
    if (nameMissing) nameInput.current?.focus()
  }, [nameMissing])

  function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    if (step === "design") focusHeading.current = true
    void wrapGift()
  }

  if (wrap.stage === "ready") {
    const base = transport.previewUrl(wrap.letterId, wrap.templateId)
    const src = noteVersion ? `${base}${base.includes("?") ? "&" : "?"}note=${noteVersion}` : base
    // From md up this fills the finder exactly: the preview takes the height
    // that is left, the share panel sits beside it, and nothing scrolls.
    return (
      <div className="md:flex md:min-h-0 md:flex-1 md:flex-col">
        <BackButton onBack={backToIdeas} />
        <h2 className="mt-2 font-display text-2xl leading-tight text-night-petal outline-none" tabIndex={-1} data-autofocus>
          Ready to send
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-night-lilac">This is the page they will open. Send them the link, or show them the QR code.</p>
        <div className="mt-4 grid gap-5 md:min-h-0 md:flex-1 md:grid-cols-[minmax(0,300px)_minmax(0,1fr)] md:gap-8 lg:grid-cols-[minmax(0,330px)_minmax(0,1fr)]">
          {/* On phones the link comes first: sending it is the point. */}
          <div className="order-first space-y-4 md:order-none md:col-start-2 md:row-start-1 md:min-h-0 md:overflow-y-auto">
            <SharePanel url={transport.shareUrl(wrap.slug)} />
            {/* A voice note: most senders add it here, right after wrapping. */}
            <AudioNoteRecorder letterId={wrap.letterId} recipientName={wrap.details.recipientName.trim() || null} onChange={() => setNoteVersion((v) => v + 1)} />
            {/* The personalised wrapper: a guest is asked to create a free account first. */}
            <MakeItUnique letterId={wrap.letterId} />
            <KeepingNote account={account} />
          </div>
          <div className="flex flex-col md:col-start-1 md:row-start-1 md:min-h-0">
            <PreviewFrame key={src} src={src} />
            <button type="button" onClick={() => setEnlarged(src)} className={`mt-2.5 inline-flex items-center gap-1.5 self-start text-sm ${quietLink}`}>
              <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
              See the page larger
            </button>
          </div>
        </div>
        <PreviewDialog src={enlarged} title="Your gift, as they will see it" onClose={() => setEnlarged(null)} />
      </div>
    )
  }

  const { details } = wrap
  const filled = wrap.stage === "choose" ? (wrap.filled ?? []) : []
  const design = getTemplate(wrap.templateId)?.name
  const exchangeView = (
    <div ref={exchangeBox}>
      <WrapExchange items={exchange} streaming={state.streaming} status={state.status} onSend={(text) => void send(text)} />
    </div>
  )

  return (
    <form id={WRAP_FORM_ID} onSubmit={submit} aria-busy={busy} noValidate>
      <div ref={top}>
        {step === "design" ? (
          <>
            <BackButton onBack={backToIdeas} />
            <h2 className="mt-2 font-display text-2xl leading-tight text-night-petal outline-none" tabIndex={-1} data-autofocus data-step-heading>
              Wrap it in a page for them
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-night-lilac">
              <span className="font-semibold text-night-petal">Step 1 of 2.</span> Choose how it looks. Majnu writes the page around your gift.
            </p>
          </>
        ) : (
          <>
            <h2 className="font-display text-2xl leading-tight text-night-petal outline-none" tabIndex={-1} data-step-heading>
              Who is it for?
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-night-lilac">
              <span className="font-semibold text-night-petal">Step 2 of 2{design ? ` · ${design}` : ""}.</span> Only their name is needed.
            </p>
          </>
        )}
      </div>

      {exchangeView}

      {step === "design" ? (
        <fieldset className="mt-4" disabled={busy}>
          <legend className="sr-only">Design</legend>
          {/* Four designs (no party pop box) sit two by two; five, three and two. */}
          <div className={`grid gap-3 ${templates.length === 4 ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
            {templates.map((id) => {
              const selected = wrap.templateId === id
              return (
                <label key={id} className="group relative block cursor-pointer rounded-3xl">
                  <input type="radio" name="template" value={id} checked={selected} onChange={() => chooseTemplate(id as WrapTemplateId)} className="peer sr-only" />
                  <TemplateCard
                    id={id}
                    orientation="responsive"
                    className={`h-full transition-shadow duration-300 ease-calm peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-night-rose [&_[data-template-thumbnail]]:w-[88px] md:[&_[data-template-thumbnail]]:mx-auto md:[&_[data-template-thumbnail]]:w-full md:[&_[data-template-thumbnail]]:max-w-[150px] ${
                      selected ? "ring-2 ring-night-rose" : "group-hover:ring-night-petal/30"
                    }`}
                  />
                  {selected && (
                    <span aria-hidden="true" className="pointer-events-none absolute right-3 top-3 rounded-full bg-night-rose px-2.5 py-1 text-xs font-semibold text-night-plum">
                      Chosen
                    </span>
                  )}
                </label>
              )
            })}
          </div>
        </fieldset>
      ) : (
        <fieldset className="mt-4 grid grid-cols-2 items-end gap-x-3 gap-y-3.5" disabled={busy}>
          <legend className="sr-only">Their name, your name, a note and the gift code</legend>
          {filled.length > 0 && (
            <p role="status" className="col-span-2 text-sm leading-relaxed text-night-lilac">
              Majnu filled in {listOf(filled.map((key) => FIELD_WORDS[key]))} from your message. Check before you wrap.
            </p>
          )}
          <label className="block text-sm font-medium text-night-petal">
            Their name
            <input
              ref={nameInput}
              className={field}
              value={details.recipientName}
              onChange={(e) => editDetails({ recipientName: e.target.value })}
              autoComplete="off"
              required
              aria-required="true"
              aria-invalid={nameMissing}
              aria-describedby={nameMissing ? "wrap-name-missing" : undefined}
              maxLength={WRAP_LIMITS.recipientName}
            />
          </label>
          <label className="block text-sm font-medium text-night-petal">
            Your name {optional}
            <input
              className={field}
              value={details.senderName}
              onChange={(e) => editDetails({ senderName: e.target.value })}
              autoComplete="given-name"
              maxLength={WRAP_LIMITS.senderName}
            />
          </label>
          {nameMissing && (
            <p id="wrap-name-missing" className="col-span-2 -mt-1.5 text-sm text-night-rose">
              {NAME_REQUIRED}
            </p>
          )}
          <label className="col-span-2 block text-sm font-medium text-night-petal">
            A note for them {optional}
            <textarea
              className={`${field} min-h-[72px] resize-y`}
              value={details.note}
              onChange={(e) => editDetails({ note: e.target.value })}
              placeholder="Happy birthday. I saw this and thought of you."
              rows={2}
              maxLength={WRAP_LIMITS.note}
            />
          </label>
          <label className="col-span-2 block text-sm font-medium text-night-petal">
            Gift code or voucher {optional}
            <input
              className={field}
              value={details.giftCode}
              onChange={(e) => editDetails({ giftCode: e.target.value })}
              autoComplete="off"
              spellCheck={false}
              aria-describedby="wrap-code-help"
              maxLength={WRAP_LIMITS.giftCode}
            />
          </label>
          <p id="wrap-code-help" className="col-span-2 -mt-1.5 text-[13px] leading-snug text-night-lilac">
            Buy the gift in the shop first, then paste the voucher code, gift-card code or order details here. It stays hidden until they open the gift.
          </p>
        </fieldset>
      )}
    </form>
  )
}
