import type { Metadata } from "next"
import Link from "next/link"
import { LegalPage, OperatorAddress } from "@/components/legal/legal-page"
import { operator } from "@/lib/legal"

export const metadata: Metadata = {
  title: "Impressum",
  description: "Who runs Majnu and how to reach us.",
}

export default function ImpressumPage() {
  return (
    <LegalPage
      title="Impressum"
      lead={<p className="mt-10 text-[17px] leading-relaxed">The legal notice for majnu.app, as required by § 5 of the German Digital Services Act (DDG).</p>}
    >
      <h2>Who runs Majnu</h2>
      <OperatorAddress />
      {operator.vatId && <p>VAT ID: {operator.vatId}</p>}

      <h2>Gift pages</h2>
      <p>
        Gift pages at majnu.app/l/… are written by the people who use Majnu, not by us. If you find one that breaks the
        law or our <Link href="/terms">terms</Link>, email <a href={`mailto:${operator.email}`}>{operator.email}</a> with
        the link. We look at every report and remove pages that break the rules.
      </p>

      <h2>Consumer disputes</h2>
      <p>
        We are not obliged and not willing to take part in dispute resolution proceedings before a consumer arbitration
        board. If something goes wrong, write to us first; we answer every message.
      </p>
    </LegalPage>
  )
}
