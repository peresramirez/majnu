import type { Metadata } from "next"
import Link from "next/link"
import type React from "react"
import { getSignedInUser } from "@/components/app/session"
import { pageContainer, smallButton } from "@/components/app/styles"
import { LETTERS_CHAT } from "@/components/app/tabs"
import { TemplateThumbnail } from "@/components/letters/template-card"
import type { TemplateId } from "@/lib/letters/schema"
import { templates } from "@/lib/letters/templates"

export const metadata: Metadata = { title: "Create" }
export const dynamic = "force-dynamic"

// The Create tab (issue #47): the optional extras beside the gift finder.
// Letters and invitations open the letters chat at /dashboard, with a template
// attached where one fits (create-chat.tsx reads ?template=); advent calendars
// need a real account, so a guest is asked to create one and comes back here.
// Issue #48 will turn calendars into picking a gift for each door.
const chatWith = (id: TemplateId) => `${LETTERS_CHAT}?template=${encodeURIComponent(id)}`

function Option({
  title,
  thumbnail,
  children,
  actions,
}: {
  title: string
  thumbnail: React.ReactNode
  children: React.ReactNode
  actions: React.ReactNode
}) {
  return (
    <li className="flex gap-4 rounded-3xl bg-night-velvet p-3 ring-1 ring-inset ring-night-petal/10 sm:gap-5">
      <div className="w-[92px] shrink-0 sm:w-[112px]">{thumbnail}</div>
      <div className="flex min-w-0 flex-1 flex-col py-1 pr-1">
        <h2 className="font-display text-[22px] leading-snug">{title}</h2>
        <div className="mt-1 text-[15px] leading-relaxed text-night-lilac">{children}</div>
        <div className="mt-auto flex flex-wrap gap-2 pt-3">{actions}</div>
      </div>
    </li>
  )
}

const thumb = (id: TemplateId) => <TemplateThumbnail id={id} className="w-full rounded-[16px]" />

export default async function CreatePage() {
  const user = await getSignedInUser()
  const guest = user?.isGuest ?? false

  return (
    <div className={pageContainer}>
      <h1 className="font-display text-[34px] leading-[1.08] sm:text-[40px]">More ways to give</h1>
      <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-night-lilac sm:text-[17px]">
        Write a letter, invite people or make an advent calendar with Majnu. Each one is a page made for them, with its own link.
      </p>

      <ul className="mt-8 grid gap-4 md:grid-cols-2">
        <Option
          title="A letter"
          thumbnail={thumb("classic-envelope")}
          actions={
            <Link href={LETTERS_CHAT} className={smallButton}>
              Write a letter
            </Link>
          }
        >
          For a birthday, a thank-you or just because. Tell Majnu what you want to say, and it helps with the words.
        </Option>

        <Option
          title="An invitation"
          thumbnail={thumb("wedding-invite")}
          actions={
            <>
              <Link href={chatWith("wedding-invite")} className={smallButton}>
                Wedding<span className="sr-only"> invitation</span>
              </Link>
              <Link href={chatWith("party-invite")} className={smallButton}>
                Party<span className="sr-only"> invitation</span>
              </Link>
            </>
          }
        >
          With the date and the place, and a gift list your guests can claim.
        </Option>

        <Option
          title="An advent calendar"
          thumbnail={thumb("advent-classic")}
          actions={
            guest ? (
              <Link href={`/signup?next=${encodeURIComponent("/dashboard/create")}`} className={smallButton}>
                Create an account
              </Link>
            ) : (
              <Link href={chatWith("advent-classic")} className={smallButton}>
                Make a calendar
              </Link>
            )
          }
        >
          {guest
            ? "Twenty-four doors to open in December. Calendars need a free account; what you made as a guest comes with you."
            : "Twenty-four doors, one to open each day in December."}
        </Option>

        <Option
          title="All templates"
          thumbnail={
            // Three of the designs, fanned out like cards in a hand.
            // The thumbnail positions itself (relative), so each sits in its own wrapper.
            <span aria-hidden="true" className="relative block aspect-[4/5]">
              {(
                [
                  ["treasure-map", "left-0 top-[6%] -rotate-[7deg]"],
                  ["postcard", "right-0 top-[6%] rotate-[7deg]"],
                  ["gift-box-3d", "left-[13%] top-0"],
                ] as const
              ).map(([id, place]) => (
                <span key={id} className={`absolute block w-[74%] overflow-hidden rounded-[14px] shadow-lg shadow-black/40 ring-1 ring-night-plum ${place}`}>
                  <TemplateThumbnail id={id} className="w-full" />
                </span>
              ))}
            </span>
          }
          actions={
            <Link href="/dashboard/templates" className={smallButton}>
              See the templates
            </Link>
          }
        >
          All {templates.length} designs, each with a preview. Start a gift from the one you like.
        </Option>
      </ul>
    </div>
  )
}
