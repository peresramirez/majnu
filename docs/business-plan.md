# Business plan

How Majnu makes money, decided 21 November. The product and build plan is in [plan.md](plan.md); how each part works is in [architecture.md](architecture.md) and [features/](features/).

## The problem and the promise

Finding the right gift for someone you love is hard, and a gift card in an email feels cold. Majnu finds the gift for you, in your language and from shops in your country, and wraps it in a page made for that one person, sent as a link.

## What is free and what is paid

| | Free | Paid |
|---|---|---|
| Finding a gift: search, three options with one recommended, personalising with a few questions | Yes, no account (3 searches a day per visitor) | |
| Wrapping the chosen gift in a default template (gift reveal, classic envelope, postcard) | Yes | |
| Letters and invitations made in chat, gift lists on invitations | Yes | |
| Advent calendars and countdowns | Yes, with a free account | |
| Sharing by link, QR code or WhatsApp, and seeing when the gift is opened | Yes | |
| **Personalised wrapper**: a one-off design made for that gift by Majnu's designer agent (Claude Code in a Daytona sandbox) | | **€2.99 once, per gift** |
| **Affiliate links** on the shops Majnu recommends | | Later (not set up) |

Everything that makes Majnu useful is free, so ads can send people straight into a working product. Money comes from the moment a sender cares most: making this one gift special.

## Revenue streams

### 1. Personalised wrapper (now)

- **Price:** €2.99 per gift, one-time, including VAT. No subscription and nothing to cancel.
- **What the buyer gets:** a page designed for this gift and this person (the 1950s cinema ticket made for Lucia's letter is the first example), kept with the gift for as long as the gift exists.
- **Where it is offered:** on the preview after wrapping a gift in the finder ("Make it unique"), and on any letter's preview in the app.
- **Who can buy:** anyone with an account. A guest is asked to create one at checkout, which keeps their gifts (the guest account is upgraded in place), so the purchase has an email for the receipt.

### 2. Affiliate links (future, not set up)

- Majnu already recommends specific products in specific shops; affiliate programmes (Amazon Associates, Awin and shops' own programmes) would pay a commission on purchases made through those links.
- **Rules before switching it on:** the recommendation must stay the best gift for the person, whether or not a shop pays (the research agent never sees commission rates); affiliate links are marked as such on the cards (in Germany "Anzeige" or "Werbung" next to the link); the privacy page names the networks and their tracking.
- **Work needed later:** programme sign-ups, a link-rewriting step on the server after research, disclosure on the product cards, and the privacy and terms changes.

## Unit economics (estimates, to be replaced by measured numbers)

| Item | Cost | Source |
|---|---|---|
| One personalised wrapper run | about $0.26 in model use for the first real run (81 s, 9 turns), plus Daytona sandbox time; capped at $3 per run | Measured once, `docs/features/daytona-redesign.md` |
| Stripe fee on €2.99 | about €0.29 (1.5% + €0.25 for standard European cards) | Stripe's standard EU pricing; check the account's actual rate |
| VAT inside €2.99 | about €0.48 at the German 19% rate | Depends on the buyer's country once sales go beyond Germany |
| **Left per wrapper** | **roughly €1.6–1.9** before hosting and ads | €2.99 minus VAT, Stripe and one run |
| One free gift search | a few short model requests plus up to 4 Tavily searches | `docs/features/gift-finder-api.md`; to be measured |

The free searches are the main cost. They are bounded by the per-visitor limit (3 a day), the site-wide daily cap (`MAJNU_DAILY_SEARCH_CAP`), the monthly spend limit in the Anthropic Console and Tavily's plan.

## The funnel and what we measure

1. **Ad → landing page.** Visitors arrive on a phone. Measure: share of visitors who send a first message.
2. **First search → a chosen gift.** Measure: searches that end with Choose; personalising rate.
3. **Wrap → share.** Measure: wrapped gifts that are shared; opens per shared gift (already tracked).
4. **Personalised wrapper.** Measure: share of wrapped gifts that buy a wrapper (attach rate), refunds.
5. **Accounts.** Measure: guests who sign up (calendars, purchases), and returning senders.

The numbers that decide the ads budget: cost per first search, cost per shared gift, and wrapper attach rate.

## Legal and practical points

- **VAT:** prices are shown including VAT. Before selling outside Germany, switch on Stripe Tax or register for the EU One-Stop Shop.
- **Right of withdrawal:** a personalised wrapper is digital content made to order and delivered at once. Under German law the 14-day withdrawal right ends when delivery starts, but only if the buyer expressly agrees to immediate delivery and confirms they lose the right; checkout must ask for both, and the terms must say so. The earlier "full refund within 14 days" promise was written for the subscription and needs rewording.
- **Receipts and refunds:** Stripe sends the receipt. A failed or broken design is refunded in full, automatically when the run fails.
- **Affiliate disclosure:** see above, before any affiliate link goes live.

## Status (21 November)

- Free product: live on majnu.app (finder, templates, sharing, tracking); guest accounts merged.
- Personalised wrapper: the Daytona design pipeline works (one real run, stored and served). Not built yet: the one-time Stripe Checkout, the "Make it unique" button, running the job in production (a queue), and the terms change. Tracked in the issue for the personalised wrapper.
- The Stripe subscription built earlier (Full moon, €4.99 a month) is switched off and will be replaced by the one-time payment.
- Affiliate links: future.
