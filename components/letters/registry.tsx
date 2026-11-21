// Picks the template component for a letter. Part of the contract: the create
// page's preview and /l/[slug] both render through <LetterRenderer>.
//
// The renderer sets the palette and font moods as CSS variables and loads the
// template faces, so a template looks the same wherever it is shown. It sends
// no events itself: /l/[slug] adds <OpenBeacon>, and templates report door and
// gift taps through the letter context, which stays silent in owner previews.
import { letterFontVariables } from "@/app/fonts"
import { Calendar } from "@/components/calendars/calendar"
import type { PublicLetter } from "@/lib/letters/schema"
import { LetterProvider } from "./letter-context"
import { ClassicEnvelope } from "./templates/classic-envelope"
import { GiftReveal } from "./templates/gift-reveal"
import { Invitation } from "./templates/invitation"
import { Postcard } from "./templates/postcard"
import { themeStyle } from "./theme"

function Template({ letter }: { letter: PublicLetter }) {
  if (letter.kind === "calendar") {
    return <Calendar content={letter.content} variant={letter.templateId === "countdown" ? "countdown" : "advent"} />
  }
  switch (letter.templateId) {
    case "gift-reveal":
      return <GiftReveal content={letter.content} />
    case "wedding-invite":
      return <Invitation content={letter.content} mood="elegant" slug={letter.slug} />
    case "party-invite":
      return <Invitation content={letter.content} mood="playful" slug={letter.slug} />
    case "postcard":
      return <Postcard content={letter.content} />
    case "classic-envelope":
    default:
      return <ClassicEnvelope content={letter.content} />
  }
}

export function LetterRenderer({ letter }: { letter: PublicLetter }) {
  return (
    <div
      className={`${letterFontVariables} min-h-[100svh] antialiased`}
      style={{ ...themeStyle(letter.content.theme), background: "var(--page-flat)", color: "var(--page-ink)" }}
      data-template={letter.templateId}
    >
      <LetterProvider slug={letter.slug} ownerPreview={letter.ownerPreview}>
        <Template letter={letter} />
      </LetterProvider>
    </div>
  )
}
