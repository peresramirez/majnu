import type { Metadata } from "next"
import Link from "next/link"
import { LegalPage, OperatorAddress, ShortVersion } from "@/components/legal/legal-page"
import { operator } from "@/lib/legal"

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What Majnu stores, why, who helps us run it, and how to have your data exported or deleted.",
}

const turnstileAddendum = "https://www.cloudflare.com/turnstile-privacy-policy/"

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
            "You can use the gift finder without signing up: you get a guest account, and creating an account later keeps everything in it.",
            "To suggest gifts you can buy nearby, the finder uses your country and region. Never your exact location or address.",
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

      <h3>Guest accounts</h3>
      <p>
        If you use the gift finder or start a gift without signing up, we give you a guest account: a random account
        number with no name, email address or password, kept in a sign-in cookie in your browser. It holds the same
        things as a full account: your finder searches, your conversations with Majnu and your gifts. We need it to
        keep what you make yours and to apply the daily limits (Art. 6 (1) (b) GDPR).
      </p>
      <p>
        When you create an account with email or Google, we add that to your guest account, so everything in it stays
        with you. If you clear your browser data or sign out before then, you can no longer reach the guest account.
        To have a guest account deleted, email us the link to one of its gifts, or create an account and ask us to
        delete it.
      </p>

      <h3>What you make</h3>
      <p>
        Your conversation with Majnu and everything you put into a gift: messages, names, gift codes, links, dates,
        places and calendar doors. We store it to build, show and change your gifts (Art. 6 (1) (b) GDPR). Please only
        include what the gift needs, especially about other people.
      </p>

      <h3>The gift finder</h3>
      <p>
        When you ask the gift finder for ideas, we store your conversation with it, what Majnu assumed about the person
        (for example &quot;mother, about 45 to 70&quot;), the gift ideas it found and the one you chose. To show gifts you can buy
        where you live, in your currency and language, we also use the <strong>country and region</strong> (for example
        &quot;Germany, Berlin&quot;) that our hosting provider Cloudflare derives from your network address, and the language
        and time zone your browser sends. We never ask for your location, never determine your exact location or
        address, and do not store the network address itself. The country and region are stored with your finder
        session, so the ideas it shows can be explained (Art. 6 (1) (b) GDPR).
      </p>

      <h3>Public social profiles</h3>
      <p>
        Only if you paste the link to a public Instagram or TikTok profile into the gift finder, we use Apify to read
        that public profile once: its bio and recent captions and hashtags. Anthropic&apos;s AI model turns them into a
        short list of the person&apos;s interests, such as &quot;climbing, film photography, ramen&quot;, and only that list
        is kept, with your finder session. We never store their posts, photos or followers, we leave out anything
        about health, beliefs, politics or sexuality, and we never read a profile nobody pasted. Other public pages
        you share are read the same way through Tavily. This serves your legitimate
        interest in finding a gift that suits the person, using only what they made public (Art. 6 (1) (f) GDPR).
        Please only share profiles of people who would be happy with it. If it is your profile and you want the summary
        deleted, email us.
      </p>

      <h3>Bot check (Cloudflare Turnstile)</h3>
      <p>
        Before we create a guest account, and when you sign in or sign up with email, Cloudflare Turnstile checks in the
        background that a person, not a program, is using the page. You don&apos;t see or click anything. For this check,
        Cloudflare processes your network address and technical information about your browser and device, and gives us
        only a pass or fail, which our sign-in provider Supabase verifies. This protects accounts and keeps automated
        sign-ups from using up the service (Art. 6 (1) (f) GDPR). How Cloudflare handles this data is described in its{" "}
        <a href={turnstileAddendum} rel="noopener noreferrer" target="_blank">Turnstile Privacy Addendum</a>.
      </p>

      <h3>When a gift is opened</h3>
      <p>
        When someone opens one of your gifts, we record the time, which door or gift they opened, the approximate
        place (the city and country of their network as Cloudflare reports it, never an address or exact location),
        the language their browser is set to, the type of device (phone, tablet or computer) and browser, and a
        visitor number. The visitor number is calculated on our server from the network address, the browser and the
        gift, so it cannot be linked across gifts; the network address itself is not stored, and nothing is saved on
        the visitor&apos;s device. Only the gift&apos;s sender sees these records, in the Tracker and My gifts tabs, and
        never the visitor number or the full browser details. This lets you see that your gift arrived. Our legal basis is the
        legitimate interest of the sender and of Majnu in confirming delivery (Art. 6 (1) (f) GDPR). Recipients can
        object by emailing us.
      </p>

      <h3>Gift lists on invitations</h3>
      <p>
        When a guest picks a gift from an invitation&apos;s gift list, we record which gift, the time and the same kind
        of visitor number, so that nobody else can pick it and one visitor cannot pick the whole list. The guest may
        leave a first name; it is optional, and only the host sees it, in My gifts. Nothing is saved on the
        guest&apos;s device. The claim is kept until the host releases it or deletes the invitation (Art. 6 (1) (f)
        GDPR).
      </p>

      <h3>Voice notes in gifts</h3>
      <p>
        If you record a voice note for a gift, we store the recording with the gift until you remove the note or delete
        the gift. Anyone who has the gift&apos;s link can hear it, so only say what you would write in the gift itself.
        We also send the recording once to OpenAI, which turns it into text, so that recipients who use a screen reader
        get the words too; we keep that text with the note (Art. 6 (1) (b) GDPR).
      </p>

      <h3>Payments</h3>
      <p>
        If you buy a personalised wrapper, Stripe handles your payment and emails your receipt. We never see your card
        number. We receive your email address, country, the amount and the payment status, and we keep, with the
        purchase, the design you asked for and the time you agreed that we start at once (Art. 6 (1) (b) and (c)
        GDPR). We keep payment records as tax law requires.
      </p>
      <p>
        To make the design, the gift&apos;s content and your description of the look are sent to a short-lived
        sandbox at Daytona in the EU, where our designer (running on Anthropic&apos;s AI model) writes the page. The
        sandbox is deleted as soon as the page is made, and in any case within 20 minutes. The finished design is
        stored with your gift and deleted with it (Art. 6 (1) (b) GDPR).
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
        We only use what the site needs to work: a cookie that keeps you signed in (also as a guest), and your light or
        dark display setting, saved in your browser. On the sign-in pages and before a guest account is created, the
        Cloudflare Turnstile check reads technical information from your browser to tell people from programs. All of
        this is strictly necessary for the service you asked for (§ 25 (2) TDDDG), so there is no cookie banner. We use
        no analytics, advertising or tracking cookies, and gift pages set none.
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
        <li><strong>Cloudflare</strong>: hosting and delivery of the site, the country and region used by the gift finder, the Turnstile bot check, and forwarding of email sent to {operator.email}.</li>
        <li><strong>Anthropic</strong>: the AI model that writes Majnu&apos;s replies and searches the web for gift ideas. Under its commercial terms, Anthropic does not use this data to train its models.</li>
        <li><strong>Google</strong>: sign-in with Google, and the mailbox our email is forwarded to.</li>
        <li><strong>Stripe</strong>: payments for personalised wrappers, and their receipts.</li>
        <li><strong>Daytona</strong>: the short-lived sandbox in the EU where a personalised wrapper is designed.</li>
        <li><strong>Tavily</strong>: web search for gift ideas. It receives the search queries Majnu writes to find them, and the address of a public page you share.</li>
        <li><strong>Apify</strong>: reads a public Instagram or TikTok profile, only when you paste its link into the gift finder.</li>
        <li><strong>OpenAI</strong>: turns what you say into text, when you use the microphone or add a voice note to a gift. We do not keep the recording for this; OpenAI does not use data sent through its API to train its models.</li>
      </ul>

      <h2>Transfers outside the EU</h2>
      <p>
        Anthropic, Apify, Cloudflare, Google, OpenAI, Stripe and Tavily may process data in the United States. Where a provider is certified
        under the EU–US Data Privacy Framework, the transfer is based on that adequacy decision; otherwise it is
        covered by the European Commission&apos;s standard contractual clauses (Art. 46 GDPR).
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Your account, gifts and conversations: until you delete them or ask us to delete your account.</li>
        <li>Guest accounts: the same; once you create an account, they are your account.</li>
        <li>Finder sessions, with their country and region and any summary of a public profile: as long as the account they belong to.</li>
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
