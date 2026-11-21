import { CalendarDays, Flower2, Gift, Hourglass, Mail, PartyPopper, Stamp, type LucideIcon } from "lucide-react"
import type { TemplateId } from "@/lib/letters/schema"

// One small icon per template, for cards and chips.
const icons: Record<TemplateId, LucideIcon> = {
  "classic-envelope": Mail,
  "gift-reveal": Gift,
  "wedding-invite": Flower2,
  "party-invite": PartyPopper,
  postcard: Stamp,
  "advent-classic": CalendarDays,
  countdown: Hourglass,
}

export function TemplateIcon({ id, className = "h-5 w-5" }: { id: TemplateId; className?: string }) {
  const Icon = icons[id] ?? Mail
  return <Icon className={className} aria-hidden="true" />
}
