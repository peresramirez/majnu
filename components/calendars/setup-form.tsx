"use client"

// Starting a calendar the sender fills door by door (issue #48): who it is for
// (the finder's context), what one door may cost, and when it opens. Sending it
// creates the calendar with every door empty, then opens the editor, which
// asks Majnu for a pool of ideas straight away.
import { useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight } from "lucide-react"
import { MoonPhase } from "@/components/brand/moon-phase"
import { focusRing, primaryButton } from "@/components/app/styles"
import { addDays, ADVENT_DOORS, countdownStart, defaultAdventStart, MAX_COUNTDOWN_DAYS, todayIn } from "@/lib/calendars/doors"
import type { CalendarRelationshipKind, CalendarSetupRequest } from "@/lib/calendars/types"
import type { CalendarTemplateId } from "@/lib/letters/schema"
import { createCalendar } from "./api"
import { formatDay } from "./dates"

const RELATIONSHIPS: { kind: CalendarRelationshipKind; label: string; words: string }[] = [
  { kind: "partner", label: "Partner", words: "my partner" },
  { kind: "parent", label: "Mum or dad", words: "my mum" },
  { kind: "friend", label: "Friend", words: "my best friend" },
  { kind: "sibling", label: "Sister or brother", words: "my sister" },
  { kind: "child", label: "Child", words: "my child" },
  { kind: "grandparent", label: "Grandparent", words: "my grandma" },
  { kind: "colleague", label: "Colleague", words: "a colleague" },
  { kind: "other", label: "Someone else", words: "someone I love" },
]

const DOOR_BUDGETS = ["under 5 €", "under 10 €", "under 20 €"]

const field =
  "mt-2 block w-full rounded-2xl bg-night-velvet px-4 py-3 text-[16px] text-night-petal ring-1 ring-inset ring-night-petal/15 placeholder:text-night-lilac/60 transition-shadow duration-200 ease-calm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-night-rose"
const label = "block text-[15px] font-semibold text-night-petal"
const hint = "mt-1.5 text-[14px] leading-relaxed text-night-lilac"

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`rounded-full px-4 py-2.5 text-[15px] font-medium transition-colors duration-200 ease-calm ${focusRing} ${
        selected ? "bg-night-rose text-night-plum" : "bg-night-velvet text-night-petal ring-1 ring-inset ring-night-petal/15 hover:ring-night-petal/35"
      }`}
    >
      {children}
    </button>
  )
}

function Step({ phase, title, children }: { phase: number; title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="border-t border-night-petal/10 pt-8 first:border-t-0 first:pt-0">
      <h2 className="flex items-center gap-3 font-display text-[28px] leading-tight">
        {/* The moon fills as the form goes on, as the calendar's doors will. */}
        <MoonPhase lit={phase} size={26} className="flex-none text-night-rose" />
        {title}
      </h2>
      <div className="mt-6 grid gap-6">{children}</div>
    </section>
  )
}

function timezones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone")
  } catch {
    return ["Europe/Berlin", "Europe/London", "Europe/Paris", "America/New_York", "UTC"]
  }
}

export function CalendarSetupForm({ senderName: initialSender }: { senderName: string }) {
  const router = useRouter()
  const ids = {
    name: useId(),
    words: useId(),
    age: useId(),
    interests: useId(),
    about: useId(),
    profile: useId(),
    budget: useId(),
    last: useId(),
    lastBudget: useId(),
    start: useId(),
    days: useId(),
    bigDay: useId(),
    tz: useId(),
    sender: useId(),
    error: useId(),
  }

  const [templateId, setTemplateId] = useState<CalendarTemplateId>("advent-classic")
  const [name, setName] = useState("")
  const [kind, setKind] = useState<CalendarRelationshipKind>("partner")
  const [words, setWords] = useState("")
  const [age, setAge] = useState("")
  const [interests, setInterests] = useState("")
  const [about, setAbout] = useState("")
  const [profileLink, setProfileLink] = useState("")
  const [doorBudget, setDoorBudget] = useState("under 10 €")
  const [bigLastDoor, setBigLastDoor] = useState(true)
  const [lastDoorBudget, setLastDoorBudget] = useState("up to 50 €")
  const [timezone, setTimezone] = useState("Europe/Berlin")
  const [startDate, setStartDate] = useState(() => defaultAdventStart(new Date(), "Europe/Berlin"))
  const [days, setDays] = useState(7)
  const [bigDay, setBigDay] = useState(() => addDays(todayIn("Europe/Berlin", new Date()), 7))
  const [senderName, setSenderName] = useState(initialSender)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const zones = useMemo(timezones, [])

  // The browser knows where the sender is; the recipient is usually nearby.
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (tz) setTimezone(tz)
  }, [])

  const relationship = RELATIONSHIPS.find((r) => r.kind === kind)!
  const doors = templateId === "advent-classic" ? ADVENT_DOORS : days
  const firstDoor = templateId === "advent-classic" ? startDate : countdownStart(bigDay, days)
  const ready = name.trim() && senderName.trim() && doorBudget.trim() && firstDoor && !busy

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    setError(null)
    const ageNumber = Number.parseInt(age, 10)
    const body: CalendarSetupRequest = {
      templateId,
      ...(templateId === "countdown" ? { days } : {}),
      recipientName: name.trim(),
      senderName: senderName.trim(),
      relationship: words.trim() || relationship.words,
      kind,
      ...(Number.isFinite(ageNumber) && ageNumber > 0 ? { ageMin: ageNumber, ageMax: ageNumber } : {}),
      interests: interests.split(",").map((s) => s.trim()).filter(Boolean),
      ...(about.trim() ? { about: about.trim() } : {}),
      ...(profileLink.trim() ? { profileLink: profileLink.trim() } : {}),
      doorBudget: doorBudget.trim(),
      ...(bigLastDoor && lastDoorBudget.trim() ? { lastDoorBudget: lastDoorBudget.trim() } : {}),
      startDate: firstDoor,
      timezone,
      locale: {
        language: navigator.language,
        languages: [...(navigator.languages ?? [])].slice(0, 5),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    }
    const result = await createCalendar(body)
    if (!result.ok) {
      setBusy(false)
      setError(result.error)
      return
    }
    router.push(`/dashboard/calendars/${result.data.letterId}?ideas=1`)
  }

  return (
    <form onSubmit={submit} aria-describedby={error ? ids.error : undefined} className="grid gap-10" noValidate>
      <Step phase={0.2} title="Who is it for?">
        <div>
          <label htmlFor={ids.name} className={label}>
            Their name
          </label>
          <input id={ids.name} className={field} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="off" required />
        </div>
        <fieldset>
          <legend className={label}>Who they are to you</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {RELATIONSHIPS.map((r) => (
              <Chip key={r.kind} selected={kind === r.kind} onClick={() => setKind(r.kind)}>
                {r.label}
              </Chip>
            ))}
          </div>
          <label htmlFor={ids.words} className="sr-only">
            In your words
          </label>
          <input
            id={ids.words}
            className={field}
            value={words}
            onChange={(e) => setWords(e.target.value)}
            placeholder={`In your words, e.g. “${relationship.words}”`}
            maxLength={80}
          />
        </fieldset>
        <div className="grid gap-6 sm:grid-cols-[140px_minmax(0,1fr)]">
          <div>
            <label htmlFor={ids.age} className={label}>
              Their age
            </label>
            <input id={ids.age} className={field} inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="Optional" />
          </div>
          <div>
            <label htmlFor={ids.interests} className={label}>
              What they love
            </label>
            <input
              id={ids.interests}
              className={field}
              value={interests}
              onChange={(e) => setInterests(e.target.value)}
              placeholder="Tea, yoga, crime novels"
              aria-describedby={`${ids.interests}-hint`}
            />
            <p id={`${ids.interests}-hint`} className={hint}>
              A few words, with commas between them.
            </p>
          </div>
        </div>
        <div>
          <label htmlFor={ids.about} className={label}>
            Anything else Majnu should know
          </label>
          <textarea
            id={ids.about}
            className={`${field} min-h-[96px] resize-y`}
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            maxLength={600}
            placeholder="She is always cold, loves her morning ritual and just started pottery."
          />
        </div>
        <div>
          <label htmlFor={ids.profile} className={label}>
            Their public profile
          </label>
          <input
            id={ids.profile}
            className={field}
            type="url"
            inputMode="url"
            value={profileLink}
            onChange={(e) => setProfileLink(e.target.value)}
            placeholder="instagram.com/name, optional"
            aria-describedby={`${ids.profile}-hint`}
          />
          <p id={`${ids.profile}-hint`} className={hint}>
            A public Instagram or TikTok profile, or a page about them. Majnu reads it once for a few interests and keeps nothing else.
          </p>
        </div>
      </Step>

      <Step phase={0.5} title="How much behind each door?">
        <fieldset>
          <legend className={label}>One door</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {DOOR_BUDGETS.map((b) => (
              <Chip key={b} selected={doorBudget === b} onClick={() => setDoorBudget(b)}>
                {b.charAt(0).toUpperCase() + b.slice(1)}
              </Chip>
            ))}
          </div>
          <label htmlFor={ids.budget} className="sr-only">
            Budget for one door
          </label>
          <input id={ids.budget} className={field} value={doorBudget} onChange={(e) => setDoorBudget(e.target.value)} maxLength={60} placeholder="Or in your words" />
        </fieldset>
        <div>
          <div className="flex items-start gap-3">
            <input
              id={ids.last}
              type="checkbox"
              checked={bigLastDoor}
              onChange={(e) => setBigLastDoor(e.target.checked)}
              className={`mt-1 h-5 w-5 flex-none rounded accent-night-rose ${focusRing}`}
            />
            <label htmlFor={ids.last} className="text-[15px] leading-relaxed">
              <span className="font-semibold">A bigger gift behind the last door</span>
              <span className="block text-night-lilac">{templateId === "advent-classic" ? "For the 24th." : "For the big day."}</span>
            </label>
          </div>
          {bigLastDoor ? (
            <>
              <label htmlFor={ids.lastBudget} className="sr-only">
                Budget for the last door
              </label>
              <input id={ids.lastBudget} className={field} value={lastDoorBudget} onChange={(e) => setLastDoorBudget(e.target.value)} maxLength={60} />
            </>
          ) : null}
        </div>
      </Step>

      <Step phase={0.8} title="When does it open?">
        <fieldset>
          <legend className="sr-only">Kind of calendar</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                { id: "advent-classic", name: "Advent calendar", text: "24 doors, one a day until Christmas Eve." },
                { id: "countdown", name: "Countdown", text: "One door a day for any number of days, up to a big day." },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={templateId === t.id}
                onClick={() => setTemplateId(t.id)}
                className={`rounded-2xl bg-night-velvet p-4 text-left transition-shadow duration-200 ease-calm ${focusRing} ${
                  templateId === t.id ? "ring-2 ring-night-rose" : "ring-1 ring-night-petal/10 hover:ring-night-rose/40"
                }`}
              >
                <span className="block font-display text-[22px] leading-tight">{t.name}</span>
                <span className="mt-1 block text-[14px] leading-relaxed text-night-lilac">{t.text}</span>
              </button>
            ))}
          </div>
        </fieldset>
        {templateId === "advent-classic" ? (
          <div>
            <label htmlFor={ids.start} className={label}>
              The first door opens on
            </label>
            <input id={ids.start} type="date" className={`${field} [color-scheme:dark]`} value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <label htmlFor={ids.days} className={label}>
                How many days
              </label>
              <input
                id={ids.days}
                type="number"
                min={1}
                max={MAX_COUNTDOWN_DAYS}
                className={field}
                value={days}
                onChange={(e) => setDays(Math.max(1, Math.min(MAX_COUNTDOWN_DAYS, Number(e.target.value) || 1)))}
              />
            </div>
            <div>
              <label htmlFor={ids.bigDay} className={label}>
                The big day
              </label>
              <input id={ids.bigDay} type="date" className={`${field} [color-scheme:dark]`} value={bigDay} onChange={(e) => setBigDay(e.target.value)} required />
            </div>
          </div>
        )}
        <div>
          <label htmlFor={ids.tz} className={label}>
            Doors open at midnight in
          </label>
          <select id={ids.tz} className={field} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {(zones.includes(timezone) ? zones : [timezone, ...zones]).map((zone) => (
              <option key={zone} value={zone}>
                {zone.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <p className={hint}>
            {doors} {doors === 1 ? "door" : "doors"}, from {formatDay(firstDoor)} to {formatDay(addDays(firstDoor, doors - 1))}.
          </p>
        </div>
        <div>
          <label htmlFor={ids.sender} className={label}>
            Your name, as they know you
          </label>
          <input id={ids.sender} className={field} value={senderName} onChange={(e) => setSenderName(e.target.value)} maxLength={60} autoComplete="given-name" required />
        </div>
      </Step>

      <div className="grid gap-3">
        {error ? (
          <p id={ids.error} role="alert" className="rounded-2xl bg-night-velvet px-4 py-3 text-[15px] text-night-petal ring-1 ring-night-orchid/40">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={!ready} className={`w-full sm:w-auto sm:justify-self-start ${primaryButton}`}>
          {busy ? "Creating the calendar…" : "Create the calendar"}
          {busy ? null : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
        </button>
        <p className="text-[14px] leading-relaxed text-night-lilac">Next, Majnu finds small gifts for {name.trim() || "them"} to pick from.</p>
      </div>
    </form>
  )
}
