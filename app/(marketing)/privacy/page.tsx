import type { Metadata } from "next"
import Link from "next/link"
import { LegalPage, OperatorAddress, ShortVersion } from "@/components/legal/legal-page"
import { operator } from "@/lib/legal"

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What Majnu stores, why, who helps us run it, and how to have your data exported or deleted.",
}

// Keep this page true to the code. If what we store or who processes it changes
// (docs/plan.md, Data and Agents sections), change this page in the same commit.
export default function PrivacyPage() {
  const mail = <a href={`mailto:${operator.email}`}>{operator.email}</a>

  return (
    <LegalPage
      title="Privacy policy"
      lead={
        <ShortVersion
          items={[
            "We keep what it takes to make and send your gifts: your account, what you write, and when your gifts are opened.",
            "We don't sell data, show ads or use advertising or analytics cookies.",
            "Your chat with Majnu is processed by Anthropic, the company behind the AI model, to write the replies.",
            "Anyone with a gift's link can open it. Gift pages are hidden from search engines.",
            <>You can ask for a copy of your data or have it deleted at any time: {mail}.</>,
          ]}
        />
      }
    >
      <h2>Who is responsible</h2>
      <p>The controller for your data under the GDPR is:</p>
      <OperatorAddress />

      <h2>What we store and why</h2>

      <h3>Your account</h3>
      <p>
        Your email address and, if you sign in with Google, the name and profile picture Google shares with us. If you
        sign up with a password, it is stored only as a secure hash; we never see it. We need this to give you an
        account (Art. 6 (1) (b) GDPR).
      </p>

      <h3>What you make</h3>
      <p>
        Your conversation with Majnu and everything you put into a gift: messages, names, gift codes, links, dates,
        places and calendar doors. We store it to build, show and change your gifts (Art. 6 (1) (b) GDPR). Please only
        include what the gift needs, especially about other people.
      </p>

      <h3>When a gift is opened</h3>
      <p>
        When someone opens one of your gifts, we record the time, which door or gift they opened, the type of browser
        and device, and a visitor number. The visitor number is calculated on our server from the network address,
        the browser and the gift, so it cannot be linked across gifts; the network address itself is not stored, and
        nothing is saved on the visitor&apos;s device. This lets you see that your gift arrived. Our legal basis is the
        legitimate interest of the sender and of Majnu in confirming delivery (Art. 6 (1) (f) GDPR). Recipients can
        object by emailing us.
      </p>

      <h3>Payments</h3>
      <p>
        If you choose Full moon, Stripe handles your payment. We never see your full card number. We receive your
        name, email address, country, the payment status and the subscription dates, and we keep invoices as tax law
        requires (Art. 6 (1) (b) and (c) GDPR).
      </p>

      <h3>Emails you send us</h3>
      <p>We keep your messages to {operator.email} for as long as we need them to help you (Art. 6 (1) (b) and (f) GDPR).</p>

      <h3>Technical logs</h3>
      <p>
        To deliver the site and protect it from abuse, our hosting provider processes your network address and details
        of each request. These logs are deleted automatically within seven days (Art. 6 (1) (f) GDPR).
      </p>

      <h2>Cookies</h2>
      <p>
        We only use what the site needs to work: a cookie that keeps you signed in, and your light or dark display
        setting, saved in your browser. Both are strictly necessary (§ 25 (2) TDDDG), so there is no cookie banner. We
        use no analytics, advertising or tracking cookies, and gift pages set none.
      </p>

      <h2>Gift pages and the people who receive them</h2>
      <p>
        A gift page can be opened by anyone who has its link. Gift pages are hidden from search engines, and link
        previews in chat apps show only a generic title such as &quot;A letter for Anna&quot;: never the message or a
        gift code. If you received a gift and want it taken down, email us the link.
      </p>

      <h2>Who helps us run Majnu</h2>
      <p>These providers process data on our behalf, under data processing agreements (Art. 28 GDPR):</p>
      <ul>
        <li><strong>Supabase</strong>: database and sign-in. Servers in Frankfurt, Germany.</li>
        <li><strong>Cloudflare</strong>: hosting and delivery of the site, and forwarding of email sent to {operator.email}.</li>
        <li><strong>Anthropic</strong>: the AI model that writes Majnu&apos;s replies and searches the web for gift ideas. Under its commercial terms, Anthropic does not use this data to train its models.</li>
        <li><strong>Google</strong>: sign-in with Google, and the mailbox our email is forwarded to.</li>
        <li><strong>Stripe</strong>: payments for Full moon.</li>
      </ul>

      <h2>Transfers outside the EU</h2>
      <p>
        Anthropic, Cloudflare, Google and Stripe may process data in the United States. Where a provider is certified
        under the EU–US Data Privacy Framework, the transfer is based on that adequacy decision; otherwise it is
        covered by the European Commission&apos;s standard contractual clauses (Art. 46 GDPR).
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Your account, gifts and conversations: until you delete them or ask us to delete your account.</li>
        <li>Records of when a gift was opened: for as long as the gift exists.</li>
        <li>Invoices and payment records: as long as German tax and commercial law requires, up to ten years.</li>
        <li>Technical logs: up to seven days.</li>
      </ul>

      <h2>Your rights</h2>
      <p>
        You can ask us for a copy of your data, to correct it, to delete it, to restrict how we use it, or to receive it
        in a portable format, and you can object to processing based on legitimate interest (Art. 15 to 21 GDPR).
        Email {mail} and we will reply within one month. You can also complain to a data protection supervisory
        authority, for example the one where you live.
      </p>

      <h2>Age</h2>
      <p>Majnu is for people aged 16 and over.</p>

      <h2>Changes</h2>
      <p>
        If we change this policy, we update this page and the date at the top. If a change affects how we use data you
        already gave us, we email account holders before it takes effect. See also our <Link href="/terms">terms</Link>.
      </p>
    </LegalPage>
  )
}
