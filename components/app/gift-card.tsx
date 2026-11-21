import Link from "next/link"
import { ArrowUpRight, CalendarDays, Mail } from "lucide-react"
import { TemplateIcon } from "@/components/create/template-bits"
import type { LetterSummary } from "@/lib/letters/store"
import { getTemplate } from "@/lib/letters/templates"
import { site } from "@/lib/site"
import { CopyLinkButton } from "./copy-link-button"
import { plural, shortDate, timeAgo } from "./format"
import { eyebrow, smallButton } from "./styles"

// One gift on the My gifts tab: who it is for, the design, and whether it has
// been opened.
export function GiftCard({ letter, now }: { letter: LetterSummary; now: Date }) {
  const template = letter.templateId ? getTemplate(letter.templateId) : undefined
  const name = letter.recipientName ? `For ${letter.recipientName}` : letter.title ?? "A gift in progress"
  const { stats } = letter
  const opened = stats.totalOpens > 0 && stats.lastOpenedAt !== null
  const shareUrl = `${site.url}/l/${letter.slug}`
  const FallbackIcon = letter.kind === "calendar" ? CalendarDays : Mail

  return (
    <article className="flex h-full flex-col rounded-3xl bg-night-velvet p-5 ring-1 ring-inset ring-night-petal/10 sm:p-6">
      <div className="flex items-center gap-2.5">
        <span className="text-night-rose">
          {letter.templateId ? <TemplateIcon id={letter.templateId} className="h-[18px] w-[18px]" /> : <FallbackIcon className="h-[18px] w-[18px]" aria-hidden="true" />}
        </span>
        <p className={`truncate ${eyebrow}`}>
          {template?.name ?? "No design yet"} · {shortDate(letter.createdAt, now)}
        </p>
      </div>

      <h2 className="mt-4 font-display text-2xl leading-snug text-night-petal">{name}</h2>

      <div className="mt-3 flex-1">
        {!letter.hasContent ? (
          <p className="text-[15px] text-night-lilac">Not finished yet. Continue the chat to make the page.</p>
        ) : opened ? (
          <>
            <p className="flex items-center gap-2 text-[15px] font-medium text-night-petal">
              <span className="h-2 w-2 flex-none rounded-full bg-night-rose" aria-hidden="true" />
              Opened {timeAgo(stats.lastOpenedAt!, now)}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-night-lilac">
              {stats.firstOpenedAt && stats.firstOpenedAt !== stats.lastOpenedAt ? `First opened ${timeAgo(stats.firstOpenedAt, now)} · ` : ""}
              {plural(stats.totalOpens, "open", "opens")} · {plural(stats.uniqueVisitors, "visitor", "visitors")}
            </p>
          </>
        ) : (
          <p className="flex items-center gap-2 text-[15px] text-night-lilac">
            <span className="h-2 w-2 flex-none rounded-full ring-1 ring-inset ring-night-lilac/60" aria-hidden="true" />
            Not opened yet
          </p>
        )}
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link href={`/create/${letter.id}`} className={`${smallButton} bg-night-petal/5`}>
          Continue
        </Link>
        {letter.hasContent && (
          <>
            <a href={`/l/${letter.slug}`} target="_blank" rel="noopener" className={smallButton}>
              Open link <ArrowUpRight className="h-4 w-4 max-sm:hidden" aria-hidden="true" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
            <CopyLinkButton url={shareUrl} />
          </>
        )}
      </div>
    </article>
  )
}
