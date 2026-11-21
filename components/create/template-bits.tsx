import { Box, CalendarDays, Flower2, Gift, Hourglass, Mail, Map as MapIcon, PartyPopper, Sparkles, Stamp, type LucideIcon } from "lucide-react"
import { MoonPhase } from "@/components/brand/moon-phase"
import type { TemplateId } from "@/lib/letters/schema"

// One small icon per template, for cards and chips.
const icons: Record<TemplateId, LucideIcon> = {
  "classic-envelope": Mail,
  "gift-reveal": Gift,
  "wedding-invite": Flower2,
  "party-invite": PartyPopper,
  postcard: Stamp,
  "gift-box-3d": Box,
  "party-box": Sparkles,
  "treasure-map": MapIcon,
  "advent-classic": CalendarDays,
  countdown: Hourglass,
}

export function TemplateIcon({ id, className = "h-5 w-5" }: { id: TemplateId; className?: string }) {
  const Icon = icons[id] ?? Mail
  return <Icon className={className} aria-hidden="true" />
}

// Marks templates that need the Full moon plan (see lib/plans.ts).
export function FullMoonBadge() {
  return (
    <span className="inline-flex flex-none items-center gap-1.5 rounded-full bg-night-rose/15 px-2.5 py-1 text-xs font-semibold text-night-rose">
      <MoonPhase lit={1} size={12} />
      Full moon
    </span>
  )
}
