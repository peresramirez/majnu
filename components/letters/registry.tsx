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
import { AUDIO_SPACE_CSS, AudioNote, type LetterAudio } from "./audio-note"
import { LetterProvider } from "./letter-context"
import { ClassicEnvelope } from "./templates/classic-envelope"
import { GiftBox3D } from "./templates/gift-box-3d"
import { GiftReveal } from "./templates/gift-reveal"
import { Invitation } from "./templates/invitation"
import { PartyBox } from "./templates/party-box"
import { Postcard } from "./templates/postcard"
import { TreasureMap } from "./templates/treasure-map"
import { WeddingEnvelope3D } from "./templates/wedding-envelope-3d"
import { paletteOf, themeStyle } from "./theme"
import { VoiceNoteProvider } from "./voice-player"
import { isOwnAudioSrc, templateHasVoiceSlot } from "./voice-player-model"

// Safari 26 and later colour their status bar and toolbar from the root's
// background (theme-color is ignored), so the page's root takes the template's
// own flat colour. It comes from the fixed palette table, never from content.
// Two pseudo-classes, so it wins over the night surface of the owner layout.
function rootColourCss(colour: string) {
  return `:root:has([data-letter-page]),:root:has([data-letter-page]) body{background-color:${colour}}`
}

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
    case "gift-box-3d":
      return <GiftBox3D content={letter.content} mood="gift" />
    case "party-box":
      return <PartyBox content={letter.content} slug={letter.slug} />
    case "treasure-map":
      return <TreasureMap content={letter.content} />
    case "wedding-envelope-3d":
      return <WeddingEnvelope3D content={letter.content} slug={letter.slug} />
    case "classic-envelope":
    default:
      return <ClassicEnvelope content={letter.content} />
  }
}

// `audio` is the sender's voice note, when the letter has one (issues #38 and
// #83). The page fills it on the server. Templates that place
// <VoiceNoteSlot /> in their own story (VOICE_NOTE_IN_TEMPLATE) get it through
// VoiceNoteProvider and show the voice player there, once the envelope or the
// gift is open. Any other letter template shows the "Tap to hear" pill at the
// top, in a band its first screen makes room for (AUDIO_SPACE_CSS). Calendars
// never get a note, and a note that is not on our own domain is dropped.
export function LetterRenderer({ letter, audio }: { letter: PublicLetter; audio?: LetterAudio | null }) {
  const note = audio && letter.kind === "letter" && isOwnAudioSrc(audio.src) ? audio : null
  const inTemplate = note ? templateHasVoiceSlot(letter.templateId) : false
  const pill = note && !inTemplate ? note : null
  return (
    <div
      className={`${letterFontVariables} min-h-[100svh] antialiased`}
      style={{ ...themeStyle(letter.content.theme), background: "var(--page-flat)", color: "var(--page-ink)" }}
      data-template={letter.templateId}
      data-letter-page=""
      data-audio-space={pill ? "" : undefined}
      data-voice-note={note ? (inTemplate ? "template" : "pill") : undefined}
    >
      <style>{rootColourCss(paletteOf(letter.content.theme).pageFlat)}</style>
      {pill ? <style>{AUDIO_SPACE_CSS}</style> : null}
      {/* First in the page, as it is first on screen: keyboards and screen readers meet it before the letter. */}
      {pill ? <AudioNote audio={pill} senderName={letter.content.senderName} /> : null}
      <LetterProvider slug={letter.slug} ownerPreview={letter.ownerPreview}>
        <VoiceNoteProvider note={note && inTemplate ? { audio: note, senderName: letter.content.senderName } : null}>
          <Template letter={letter} />
        </VoiceNoteProvider>
      </LetterProvider>
    </div>
  )
}
