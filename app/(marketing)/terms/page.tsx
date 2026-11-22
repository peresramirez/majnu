import type { Metadata } from "next"
import Link from "next/link"
import { LegalPage, ShortVersion } from "@/components/legal/legal-page"
import { FINDER_LIMITS as finder } from "@/lib/finder/limits"
import { operator } from "@/lib/legal"
import { WRAPPER_CONSENT_TEXT, wrapper } from "@/lib/plans"

export const metadata: Metadata = {
  title: "Terms",
  description: "The terms for using Majnu, including the personalised wrapper, refunds and your right of withdrawal.",
}

export default function TermsPage() {
  const mail = <a href={`mailto:${operator.email}`}>{operator.email}</a>

  return (
    <LegalPage
      title="Terms"
      lead={
        <ShortVersion
          items={[
            "What you write is yours. You are responsible for it, and it must not hurt or deceive anyone.",
            `Majnu is free. The one thing you can buy is a ${wrapper.name.toLowerCase()}: a design made for one gift, ${wrapper.price} once, VAT included. Nothing renews.`,
            `The gift finder is free without an account: ${finder.sessionsPerDay} gift searches a day, each looking for ideas up to ${finder.searchesPerSession} times, personalised or not.`,
            "A wrapper is made just for you as soon as you pay, so before paying you agree that this ends your right of withdrawal. If it cannot be made, you get every cent back automatically.",
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
          You can start {finder.sessionsPerDay} gift searches a day, with or without an account. A search counts from the first time
          Majnu looks for ideas in it, and within one search Majnu can look up to {finder.searchesPerSession} times, also when you tell it
          more about the person to personalise the ideas. Reloading the page or opening the finder again continues the search you
          started. When your searches for the day are used up, you can still choose and wrap the ideas you found. When very many
          people use the finder on the same day, we may pause new searches for everyone until the next day.
        </li>
        <li>
          Majnu reads only the links and handles you paste, such as a public Instagram, TikTok or LinkedIn profile; it never looks
          anyone up by name or email address. Reading a profile is limited to a small number each day across Majnu and may be
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
        <li>get around Majnu&apos;s limits or overload the service.</li>
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

      <h2>What is free and what you can buy</h2>
      <p>
        Finding gifts, wrapping them in our designs, letters, invitations, gift lists, calendars (with an account),
        sharing and seeing when a gift is opened are free. Nothing renews and there is nothing to cancel.
      </p>

      <h2 id="wrapper">The personalised wrapper</h2>
      <ul>
        <li>
          A <strong>{wrapper.name.toLowerCase()}</strong> is a design that Majnu&apos;s designer makes for one of your
          gifts, from the gift&apos;s content and a short description of the look you want. It costs {wrapper.price},
          paid once through Stripe. Prices are in euros, include VAT and are the final price you pay.
        </li>
        <li>You need a free account to buy one. Stripe sends your receipt to the account&apos;s email address.</li>
        <li>
          We start making the design as soon as Stripe confirms your payment. It is usually ready within a few minutes and
          is then shown on the gift&apos;s page, at the same link, for as long as the gift exists.
        </li>
        <li>
          The design is generated by an AI model and follows your description as well as it can. Your words and gift
          details stay as they are; the design changes how they look.
        </li>
        <li>
          If the design cannot be made, for example because the designer stops with an error or the page fails our
          safety checks, we refund your payment in full automatically. If a design we made is broken (it does not show
          your gift properly), email {mail} within 14 days and we refund it in full.
        </li>
      </ul>

      <h2>Your right of withdrawal</h2>
      <p>
        If you are a consumer, you normally have 14 days to withdraw from a contract made online, without giving a
        reason. A personalised wrapper is digital content made to order for you and delivered at once. Before you pay,
        we therefore ask you to agree, by ticking a box, that we start straight away and to confirm that you lose your
        right of withdrawal once we have started (§ 356 (5) BGB). The sentence you agree to is:{" "}
        <q>{WRAPPER_CONSENT_TEXT}</q> We store it, and the time you agreed, with your purchase. Without your agreement
        we do not take the payment.
      </p>
      <p>
        Until we start, you may withdraw by telling us clearly, for example by email to {mail}. We then refund your
        payment in full within 14 days of receiving your message, to the payment method you used. Your right to a
        refund when a design cannot be made or is broken (above) is not affected.
      </p>
      <h3>Model withdrawal form</h3>
      <p>
        If you want to withdraw, you can send this text to {operator.name}, {operator.street}, {operator.city},{" "}
        {operator.country}, {operator.email}:
      </p>
      <p className="rounded-2xl bg-white p-5 ring-1 ring-inset ring-day-ink/5">
        I hereby withdraw from my contract for the purchase of the following digital content: a {wrapper.name.toLowerCase()}.
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
        features may change. If we ever close Majnu, we tell you at least 30 days in advance, so you can save what you
        made, and refund any wrapper you paid for that has not been made yet.
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
