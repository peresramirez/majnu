import type { Metadata } from "next"
import Link from "next/link"
import { LegalPage, ShortVersion } from "@/components/legal/legal-page"
import { FINDER_LIMITS as finder } from "@/lib/finder/limits"
import { operator } from "@/lib/legal"
import { plans } from "@/lib/plans"

export const metadata: Metadata = {
  title: "Terms",
  description: "The terms for using Majnu, including plans, cancelling and refunds.",
}

export default function TermsPage() {
  const mail = <a href={`mailto:${operator.email}`}>{operator.email}</a>
  const free = plans.free
  const paid = plans.fullMoon

  return (
    <LegalPage
      title="Terms"
      lead={
        <ShortVersion
          items={[
            "What you write is yours. You are responsible for it, and it must not hurt or deceive anyone.",
            `${free.name} is free with ${free.giftsPerMonth} gifts a month. ${paid.name} costs ${paid.price} a month and you can cancel at any time.`,
            `The gift finder is free without an account: ${finder.searchesPerDay} searches a day, ${finder.personalisedPerDay} of them personalised.`,
            <>Changed your mind? Email {mail} within 14 days of your first {paid.name} payment and we refund it in full.</>,
            "Majnu's suggestions come from an AI. Check prices, dates and links before you send.",
          ]}
        />
      }
    >
      <h2>About these terms</h2>
      <p>
        These terms are an agreement between you and {operator.name}, who runs Majnu (details in the{" "}
        <Link href="/impressum">Impressum</Link>). By using Majnu, with an account or as a guest, you accept them. How we handle data is
        described in the <Link href="/privacy">privacy policy</Link>.
      </p>

      <h2>What Majnu does</h2>
      <p>
        Majnu helps you make a personal gift page, such as a letter, an invitation, a gift code or an advent calendar,
        by chatting with an AI assistant, and gives you a link and QR code to send it. The person you send it to needs
        no account. Its gift finder suggests gifts you can buy, and wraps the one you choose in such a page.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You must be at least 16 years old.</li>
        <li>Use an email address you can read, and keep your sign-in to yourself. You are responsible for what happens in your account.</li>
        <li>One account per person.</li>
        <li>
          Without signing up, you use Majnu with a guest account that lives in your browser. If you clear your browser
          data or sign out, you lose access to it and to what you made with it. Creating an account keeps everything.
          Calendars need an account.
        </li>
      </ul>

      <h2>The gift finder</h2>
      <ul>
        <li>
          You can search for gift ideas {finder.searchesPerDay} times a day, with or without an account, and{" "}
          {finder.personalisedPerDay} of those searches can be personalised with more about the person. When very many people use the finder on the
          same day, we may pause new searches for everyone until the next day.
        </li>
        <li>
          Reading a public Instagram or TikTok profile is limited to a small number each day across Majnu and may be
          unavailable. Only paste a profile to find a gift for that person, and only if they would be happy with it.
        </li>
        <li>Gift ideas, prices and shops come from the web and from an AI model. Check them in the shop before you buy.</li>
      </ul>

      <h2>What you make</h2>
      <p>
        You keep the rights to what you write and upload. You allow us to store it, to process it (including with the
        AI model that powers Majnu) and to show it to anyone who has the link, for as long as it is needed to provide
        Majnu to you. You are responsible for your content: make sure you are allowed to use it, and that gift codes
        and links are valid. We do not check them.
      </p>

      <h2>Rules</h2>
      <p>Do not use Majnu to:</p>
      <ul>
        <li>publish anything illegal, or anything that harasses, threatens or demeans people;</li>
        <li>trick people, for example with pages that imitate a bank, a shop or another person, or that ask for passwords or payment details;</li>
        <li>share someone else&apos;s private information without their permission;</li>
        <li>use the gift finder to gather information about people for anything other than choosing a gift for them;</li>
        <li>send spam, malware or chain messages;</li>
        <li>get around the limits of your plan or overload the service.</li>
      </ul>
      <p>
        If a gift page breaks these rules, we can take it down, and if it happens again, close the account. We tell you
        what we removed and why, unless the law stops us. You can reply to that email to ask us to look again.
      </p>

      <h2>Majnu&apos;s suggestions</h2>
      <p>
        Majnu&apos;s words, designs and gift ideas are generated by an AI model and can be wrong. Check prices,
        availability, dates, addresses and links before you send a gift. Shops we link to are run by other companies;
        anything you buy there is between you and that shop.
      </p>

      <h2>Plans and payment</h2>
      <ul>
        <li><strong>{free.name}</strong> is free and includes {free.giftsPerMonth} gifts per calendar month.</li>
        <li>
          <strong>{paid.name}</strong> costs {paid.price} {paid.period}, paid in advance through Stripe. It renews every
          month until you cancel. Prices are in euros and are the final price you pay.
        </li>
        <li>
          You can cancel at any time, from your account or by emailing {mail}. {paid.name} stays active until the end of
          the month you paid for, and everything you made stays online afterwards.
        </li>
        <li>If we change the price, we email you at least 30 days before it applies to you, and you can cancel before then.</li>
      </ul>

      <h2>Refunds and your right of withdrawal</h2>
      <p>
        If you are a consumer, you may withdraw from your {paid.name} subscription within 14 days of the day you took
        it out, without giving a reason. To do so, tell us clearly, for example by email to {mail}. We refund your
        payment in full within 14 days of receiving your message, to the payment method you used. Outside these 14
        days, payments for the current month are not refunded, except where the law requires it.
      </p>
      <h3>Model withdrawal form</h3>
      <p>
        If you want to withdraw, you can send this text to {operator.name}, {operator.street}, {operator.city},{" "}
        {operator.country}, {operator.email}:
      </p>
      <p className="rounded-2xl bg-white p-5 ring-1 ring-inset ring-day-ink/5">
        I hereby withdraw from my contract for the {paid.name} subscription.
        <br />
        Ordered on: ………
        <br />
        Name: ………
        <br />
        Email address of the account: ………
        <br />
        Date: ………
      </p>

      <h2>Availability and changes to Majnu</h2>
      <p>
        We work to keep Majnu running, but we cannot promise it will always be available or free of errors, and
        features may change. If we ever close Majnu, we tell you at least 30 days in advance and refund any time you
        have paid for but not used.
      </p>

      <h2>Ending your account</h2>
      <p>
        You can close your account at any time by emailing {mail}; we then delete your account and gifts as described
        in the privacy policy.
      </p>

      <h2>Liability</h2>
      <p>
        We are fully liable for damage caused intentionally or through gross negligence, for injury to life, body or
        health, and under the German Product Liability Act. For slight negligence we are liable only if we breach an
        obligation that is essential to the contract, and only for the typical damage that could be foreseen when the
        contract was made. Otherwise we are not liable.
      </p>

      <h2>Changes to these terms</h2>
      <p>
        If we change these terms, we email you at least 30 days before the change applies. If you do not agree, you
        can cancel and close your account before then.
      </p>

      <h2>Law</h2>
      <p>
        German law applies. If you are a consumer, this does not take away the protection of the mandatory laws of the
        country where you live.
      </p>
    </LegalPage>
  )
}
