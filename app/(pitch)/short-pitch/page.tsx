// /short-pitch: the three-slide pitch for the hackathon semifinal (Product,
// Market, Fit). Public, unlike /pitch, because the judges open the link sent
// with the presentation; it holds nothing the landing page does not say.
import { Deck } from "@/components/pitch/deck"
import { DECK_LABELS } from "@/components/pitch/slides"
import { shortPitchSlides } from "@/components/pitch/short-slides"

export default function ShortPitchPage() {
  return <Deck slides={shortPitchSlides()} labels={DECK_LABELS} />
}
