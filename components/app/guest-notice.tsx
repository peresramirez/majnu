import Link from "next/link"
import { safeNextPath, withNext } from "@/lib/billing/next-path"
import { focusRing } from "./styles"

// A quiet line under the header for guests (anonymous accounts from the gift
// finder). Creating an account keeps the same account, so nothing is lost.
// On phones it steps aside while the chat's message box has focus, like the tab bar.
// `pathname` is the page it shows on: signing up from here comes back to it.
export function GuestNotice({ pathname }: { pathname: string }) {
  return (
    <div
      role="note"
      className="flex-none border-b border-night-petal/10 bg-night-velvet/60 px-4 py-2 text-[13px] leading-snug text-night-lilac md:px-6 md:text-sm max-md:group-has-[textarea[data-composer]:focus]/shell:hidden"
    >
      You&apos;re using Majnu as a guest.{" "}
      <Link
        href={withNext("/signup", safeNextPath(pathname))}
        className={`rounded font-semibold text-night-petal underline decoration-night-rose/60 underline-offset-4 hover:decoration-night-rose ${focusRing}`}
      >
        Create an account
      </Link>{" "}
      to keep your gifts.
    </div>
  )
}
