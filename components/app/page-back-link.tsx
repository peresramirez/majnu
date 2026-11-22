import { ArrowLeft } from "lucide-react"
import { BackLink } from "@/lib/navigation/use-back"
import { focusRing } from "./styles"

// "Back" at the top of an app page that is not a tab of its own (Templates,
// Purchases, the calendar pages). It goes to the page this tab came from
// (lib/navigation/back.ts), or to `fallback` when there is none. The label
// stays "Back" because where that is depends on how the sender got here.
export function PageBackLink({ fallback, className = "" }: { fallback: string; className?: string }) {
  return (
    <BackLink
      fallback={fallback}
      className={`-ml-1 inline-flex min-h-11 items-center gap-2 rounded-full py-2 pl-1 pr-3 text-sm font-semibold text-night-lilac transition-colors duration-200 ease-calm hover:text-night-petal ${focusRing} ${className}`}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Back
    </BackLink>
  )
}
