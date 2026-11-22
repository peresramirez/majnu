import { Box, CalendarDays, Flower2, Gift, Heart, Hourglass, Mail, Map as MapIcon, PartyPopper, Sparkles, Stamp, Ticket, Package, BookOpen, type LucideIcon } from "lucide-react"
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
  "wedding-envelope-3d": Heart,
  "wedding-invite-3d": BookOpen,
  "party-invite-3d": Ticket,
  "gift-3d": Package,
  "advent-classic": CalendarDays,
  countdown: Hourglass,
}

export function TemplateIcon({ id, className = "h-5 w-5" }: { id: TemplateId; className?: string }) {
  const Icon = icons[id] ?? Mail
  return <Icon className={className} aria-hidden="true" />
}
