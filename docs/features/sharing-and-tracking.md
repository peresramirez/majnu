# Sharing and open tracking

## What it does

Once a gift is built, the sender shares its link from the panel under the preview: copy it, send it on WhatsApp, use the phone's own share sheet, or download a QR code to print. When the recipient opens the page, opens a calendar door or taps a gift, Majnu records it, with the approximate place (city and country of the network), the browser's language and the kind of device. The sender sees on **My gifts** when each gift was first and last opened, how often and by how many people, and on the **Tracker** tab an analytics dashboard: the open rate and headline numbers, opens per day over the last 30 days and by hour of the day (in the sender's timezone), the countries, devices and languages gifts were opened in, and per gift a timeline of every open: when, where, in which language and on which device. Nothing is stored on the recipient's device, no cookie is set, and the IP address is never kept.

## How it works

```mermaid
flowchart LR
  subgraph sender ["Sender, signed in"]
    panel["Share panel<br/>components/share/share-panel.tsx"]
    gifts["My gifts<br/>/dashboard/gifts"]
    tracker["Tracker dashboard<br/>/dashboard/tracker"]
  end
  subgraph recipient ["Recipient, no account"]
    page["Gift page /l/slug"]
    beacon["OpenBeacon and track()"]
  end
  panel -->|"link, QR code, WhatsApp"| page
  page --> beacon
  beacon -->|"POST /api/open"| open["Open route<br/>app/api/open/route.ts"]
  cf["Cloudflare request data<br/>request.cf, CF-IPCountry"] -.->|"country, city"| details
  open --> details["openDetails<br/>lib/open/details.ts<br/>place, language, device"]
  details --> record["recordOpenEvent<br/>lib/open/record.ts<br/>crawlers ignored"]
  record -->|"HMAC visitor id, details"| events[("letter_events")]
  events --> view[("letter_summaries view")]
  events -.->|"visitor count only"| fn["private.letter_unique_visitors"]
  fn --> view
  view -->|"caller's own rows"| gifts
  view -->|"caller's own rows"| tracker
  events -->|"granted columns, own rows<br/>lib/open/timeline.ts"| tracker
```

One open, in order:

1. The gift page renders on the server and sends HTML. A link-preview crawler (WhatsApp, iMessage) stops there: it fetches the HTML but does not run the beacon, so it does not count.
2. In the browser, [`<OpenBeacon>`](../../components/letters/open-beacon.tsx) waits until the page is actually visible (`document.visibilityState`), so a page prerendered in the background counts only when someone looks at it. Then it calls `reportOpen()`.
3. [`track.ts`](../../components/letters/track.ts) posts `{ slug, type: "open" }` to `/api/open` with `fetch(..., { keepalive: true })`, so the request finishes even if the recipient taps a link and leaves. Each event (its type and door) is sent at most once per page load, tracked in an in-memory set that a reload clears. Failures are ignored.
4. Templates report `door_open` (with the door's day) and `gift_click` (when a gift's code is copied or its link tapped, with the door's day for calendars) through `track()` from [`letter-context.tsx`](../../components/letters/letter-context.tsx). In the owner's preview `track()` does nothing and no beacon is rendered.
5. [`POST /api/open`](../../app/api/open/route.ts) reads at most 1,024 characters, parses JSON whatever the content type, and validates `{ slug, type, day? }`. It answers **204 with no body and no cookies** whether or not anything was recorded, so the endpoint reveals nothing about which slugs exist. A malformed body gets 400 and an oversized one 413. It also works out the open's details with [`openDetails()`](../../lib/open/details.ts) (see "Place, language and device" below).
6. [`recordOpenEvent()`](../../lib/open/record.ts) ignores malformed and demo slugs and crawlers (below), and records nothing if `OPEN_HASH_SECRET` is not set. It loads the letter by exact slug with the service-role client and builds its public view **as of now**, then [`trackedDay()`](../../lib/open/rules.ts) decides what to store: an `open` is always day 0; a `door_open` only for a calendar door that exists and is open now; a `gift_click` as day 0 on a letter, or for an open door on a calendar. Events for locked doors are ignored, so nobody learns anything by sending them early.
7. The visitor id is computed (below) and the row is upserted with `ON CONFLICT DO NOTHING` on the unique key `(letter_id, type, day, visitor_id)`, so a repeat visit adds nothing, not even a new place. The user agent is cut to 512 characters. The row carries the country, city, language and device.
8. If recording fails, the route logs the error and still answers 204: tracking must never break a gift page.

## Place, language and device

[`lib/open/details.ts`](../../lib/open/details.ts) holds the rules, as pure functions with one read of Cloudflare's data:

| Field | Where it comes from | Stored as |
|---|---|---|
| `country` | `request.cf.country`, read through OpenNext's `getCloudflareContext().cf` (the adapter keeps each request's `cf` in AsyncLocalStorage). Without it, the `CF-IPCountry` header. Without either (`next dev`), nothing. `XX` (unknown) and `T1` (Tor) count as nothing | Two capital letters, `DE` |
| `city` | `request.cf.city`, only when the country came from `request.cf` too. Control characters and runs of spaces folded, at most 80 characters | `Berlin`, or null |
| `language` | The `Accept-Language` range with the highest `q` (ties go to the first; `q=0`, `*`, private tags and malformed ranges are skipped), cut to its primary subtag | `de` |
| `device` | The user agent: iPad, "Tablet", Kindle and Android without "Mobile" are tablets; "Mobi", iPhone, Android with "Mobile" and other phone markers are phones; the rest desktops | `phone`, `tablet` or `desktop` |

Nothing finer is read: Cloudflare's region, postal code, coordinates, timezone and network number stay untouched, and the IP address only feeds the visitor hash. iPads on iPadOS 13 and later announce themselves as Macs, so they are recorded as desktops.

**Crawlers.** Most link-preview services never run the beacon. [`isCrawler()`](../../lib/open/details.ts) catches the rest before any database lookup: known preview bots (WhatsApp, Facebook, iMessage's `facebookexternalhit`, Telegram's `TelegramBot`, Slack, Discord, LinkedIn, X), search engines and AI crawlers, headless browsers (`HeadlessChrome`, Lighthouse), HTTP libraries (`curl`, `python-requests`, `okhttp` and others), and any user agent with `bot/`, `bot;`, `crawler` or `spider`. The in-app browsers of chat apps (Instagram, Facebook's `FBAN`, `Telegram-Android`) are people and count.

## The Tracker tab

[`/dashboard/tracker`](../../app/(app)/dashboard/tracker/page.tsx) is an analytics dashboard of how the sender's gifts are being opened (issue [#75](https://github.com/peresramirez/majnu/issues/75), built on the timeline of [#49](https://github.com/peresramirez/majnu/issues/49)). From the top, phone first:

1. **Headline numbers** ([`headline-numbers.tsx`](../../components/app/tracker/headline-numbers.tsx)): the open rate as the one large figure with a meter ("4 of 5 gifts opened"), then gifts sent, gifts opened, opens and unique visitors. Two by two on a phone, one row of six columns from 1024 px.
2. **Opens per day**, the last 30 days ending today, as a column chart with the total beside the title.
3. **Countries**, with the flag beside each name, **Time of day** (opens by hour, 00:00 to 23:00, as a column chart), **Devices** and **Languages**. The breakdowns are lists of names, each with its opens, its share and a thin bar ([`breakdown-card.tsx`](../../components/app/tracker/breakdown-card.tsx)): at most five named rows, the rest folded into "Other countries" or "Other languages" (a single leftover is named instead), and opens without the detail last as "Not recorded", so the rows add up to every open. From 768 px the cards sit two across and from 1024 px three across, with opens per day two columns wide.
4. **Your gifts**, newest first ([`tracked-gift.tsx`](../../components/app/tracker/tracked-gift.tsx)): a status chip (Opened, Not opened, Draft) and, once opened, opens, people, when it was first opened and when last ("3 hours ago" over "Today, 05:49"), how often the gift was tapped, and the timeline behind "Show timeline". Two columns from 1024 px.

Before the first open the page is the same dashboard at zero, with an invitation above it: "Send your first gift" with **Find a gift** when nothing has been sent, or "Waiting for the first open" with a link to My gifts, where the link is, when gifts are out but unopened. The charts show their empty grid with the summary ("No opens in the last 30 days yet.") over it.

```mermaid
flowchart TB
  page["page.tsx (server)<br/>listMyLetters() + listMyOpenEvents()"] --> view["TrackerView (server)<br/>tracker-view.tsx"]
  view -->|"trackerTotals()"| head["HeadlineNumbers (server)"]
  view -->|"country / device / languageBreakdown()"| lists["BreakdownCard x3 (server)"]
  view -->|"open times only"| time["OpensPerDay, OpensByHour (client)<br/>time-charts.tsx"]
  view -->|"each gift's events"| gift["TrackedGift (client)"]
  tz["useViewerTimeZone()"] --> time
  tz --> gift
  time -->|"opensPerDay(), opensByHour()<br/>summary + hidden table"| card["Chart cards"]
  time -.->|"next/dynamic, after hydration"| charts["charts.tsx<br/>Recharts via components/ui/chart.tsx"]
  analytics["analytics.ts (pure, unit-tested)"] -.-> view
  analytics -.-> time
```

How it is put together:

- **One pure module does the counting.** [`analytics.ts`](../../components/app/tracker/analytics.ts) computes the totals, the 30 days (zero-filled, stepping back by the calendar so a 23- or 25-hour day around a clock change neither skips nor repeats one), the 24 hours, the breakdowns, the clean whole-number ticks of the count axis (0, 2, 4, 6) and the sentence under each chart. A single busiest day or hour is named ("Busiest day: Saturday 21 November, with 5 opens."); when several tie, naming one would be arbitrary, so it says how many days or hours had opens instead.
- **What counts as an open** is the same everywhere: a page open or a calendar door, never a gift tap (taps are counted on their own). A gift's opens are `total_opens` from `letter_summaries` plus its doors, as in its status line. **Gifts sent** are the letters with a finished page; drafts are listed but not counted. **Unique visitors** is the sum of each gift's `unique_visitors`; the visitor hash includes the letter, so one person who opens two gifts counts once for each, and the tile says "Once per gift".
- **Server and client.** The page, the headline numbers and the breakdowns render on the server; none of them depend on a timezone. The two charts and the gift rows are client components: days and hours are in the viewer's timezone, so they render in UTC in the server's HTML and re-render in the browser's own timezone right after hydration ([`useViewerTimeZone()`](../../components/app/tracker/use-time-zone.ts), `useSyncExternalStore`, no hydration mismatch). The header says which timezone is in use. The charts receive only the times of the opens, not the events.
- **Chart code loads only here, and late.** [`charts.tsx`](../../components/app/tracker/charts.tsx) is the only module that imports Recharts (2.15, through the shadcn wrapper [`components/ui/chart.tsx`](../../components/ui/chart.tsx)); [`time-charts.tsx`](../../components/app/tracker/time-charts.tsx) loads it with `next/dynamic` and `ssr: false`. The card around each chart (title, summary, hidden table) renders without it and keeps the chart's height, so nothing moves when it arrives.
- **How the charts look** (following the `dataviz` guidance): one series, so one colour, rose gold `#EAB394` on the velvet card (8.6:1 contrast, measured with the skill's validator); bars at most 24 px wide with 4 px rounded tops and a 2 px gap; hairline grid lines and a faint baseline; tick labels on both axes in lilac (a label every week ending on "Today"; 00:00, 06:00, 12:00, 18:00). The tooltip leads with the value ("5 opens") over the day or hour, and the hovered bar lightens. Bars grow in over 700 ms, and not at all with reduced motion.
- **Accessible without the picture.** Each chart's SVG is `role="img"` with a title and a description (the total and the summary). A visually hidden table lists the days or hours with opens; it is wrapped in an `sr-only` div because a table ignores `sr-only`'s 1 px width and would widen the page. Keyboard users tab to each chart (Recharts' `accessibilityLayer`) and move through the bars with the arrow keys; the tooltip follows, and hides again when focus leaves the chart (Recharts only hides it on mouse leave). `chart.tsx` removes the outline from the chart's surface, so the Tracker puts the rose focus ring back. The breakdowns are real text ("Germany, 28 opens, 53%"); their bars and the flags are hidden from screen readers.
- **The timeline**, behind "Show timeline" (a native `<details>`, so it opens with Enter or Space and works without JavaScript): one line per open, door and gift tap, grouped by day ("Today", "Yesterday", "Friday 20 November"), each with the time, the flag and "Berlin, Germany", the language name ("German", from `Intl.DisplayNames`) and the device ("Phone", "Tablet", "Computer"). Rows from before the details were recorded say "Place and device not recorded". At most the newest 100 lines per gift are shown.

[`listMyOpenEvents()`](../../lib/open/timeline.ts) reads the newest 1,000 events with the sender's own session, asking only for the columns owners are granted. The grouping and wording of the timeline live in [`timeline.ts`](../../components/app/tracker/timeline.ts), pure and unit-tested; it caches one `Intl.DateTimeFormat` per timezone and style, since the dashboard buckets up to a thousand events.

**Guests** (anonymous accounts from the gift finder) see an invitation instead ([`tracker-invite.tsx`](../../components/app/tracker/tracker-invite.tsx)), unchanged by the dashboard: a free account shows when, roughly where, in which language and on which device each gift is opened, and keeps everything made as a guest. Its button links to `/signup?next=%2Fdashboard%2Ftracker`; sign-up upgrades the same account and `safeNextPath()` brings them back.

Screenshots of the empty, sparse and busy states at 375 px and 1440 px are in [`screenshots/tracker-dashboard/`](screenshots/tracker-dashboard/).

## The share panel

[`<SharePanel url locked onUnlock>`](../../components/share/share-panel.tsx) is part of the contract between the two developers. The create page's preview pane ([`preview-pane.tsx`](../../components/create/preview-pane.tsx)) shows it under the gift with the link `${site.url}/l/<slug>`; the workbench shows it in both states.

| Action | How |
|---|---|
| Copy | Copies the link and says "Copied" for two seconds, with a hidden-textarea fallback for in-app browsers that block the Clipboard API ([`copy-button.tsx`](../../components/letters/copy-button.tsx)) |
| WhatsApp | Opens `https://wa.me/?text=` with "I made something for you." and the link |
| Share | The phone's own share sheet through `navigator.share`, only where the browser has one |
| QR code | Drawn on screen as one SVG path; downloads as PNG (24 px per module, drawn on a canvas) or SVG (16 px per module), both with the four-module quiet zone scanners expect |

The QR encoding comes from `uqr`, a small dependency-free encoder, at error-correction level M ([`qr.ts`](../../components/share/qr.ts)); everything else is ours. The code is deterministic, so the server and the browser draw the same one.

`locked` shows "Create a free account to send it" instead of the link, with a blurred QR code, and `onUnlock` starts the sign-up. Nothing is locked behind a payment any more, so the create page no longer sets it; it stays in the contract for a gift that needs an account. Under the share panel, the letter preview and the finder's wrapped gift show "Make it unique, €2.99", the personalised wrapper ([billing.md](billing.md)).

## The visitor hash

[`visitorId()`](../../lib/open/visitor.ts) is an **HMAC-SHA-256** under `OPEN_HASH_SECRET` of the JSON array `[letterId, ip, userAgent]`, as 64 hex characters, computed with Web Crypto (which Workers and Node both provide).

- The IP address comes from Cloudflare's `cf-connecting-ip` header, or the first `X-Forwarded-For` entry in local development. It is used for the hash and **never stored**.
- Hashing an IP address without a secret could be reversed by trying every address, so the function refuses to run without one.
- The letter id is part of the input, so the same person gets different ids on different letters and cannot be followed from one gift to another.
- JSON keeps the fields apart, so `("a", "bc")` and `("ab", "c")` cannot collide.
- Changing the secret makes every returning visitor count as new.

This is what lets the site run without a cookie banner (§ 25 TDDDG), and it is what [`/privacy`](../../app/(marketing)/privacy/page.tsx) promises. If open tracking changes, the privacy page changes in the same commit.

## Statistics and My gifts

The dashboard reads the `letter_summaries` view ([`0001_init.sql`](../../supabase/migrations/0001_init.sql), changed in [`0009_open_details.sql`](../../supabase/migrations/0009_open_details.sql)), which is `security_invoker`: it runs with the caller's privileges, so row-level security decides which letters a user sees, and the statistics are computed in the database in one query.

| Column | Meaning |
|---|---|
| `first_opened_at` | The earliest event of any kind |
| `last_opened_at` | The latest event of any kind (a door opened today moves it) |
| `total_opens` | Rows of type `open`. Because each visitor is recorded once per event type and door, this counts **visitors who opened the gift**, not page loads |
| `unique_visitors` | Distinct visitor ids across all event types, counted by `private.letter_unique_visitors()` (below) because owners cannot read the visitor ids themselves |

[`listMyLetters()`](../../lib/letters/store.ts) returns the user's letters newest first with these numbers, and [`/dashboard/gifts`](../../app/(app)/dashboard/gifts/page.tsx) shows one card per gift ([`components/app/gift-card.tsx`](../../components/app/gift-card.tsx)): who it is for, the template and date, "Opened 2 hours ago", "First opened … · 3 opens · 2 visitors" or "Not opened yet", and a button to copy the link again. The page header counts gifts and how many have been opened.

## Pieces

| Piece | Job |
|---|---|
| [`components/share/share-panel.tsx`](../../components/share/share-panel.tsx), [`components/share/qr.ts`](../../components/share/qr.ts) | The share panel and QR drawing |
| [`components/letters/open-beacon.tsx`](../../components/letters/open-beacon.tsx) | One `open` per page load, once the page is visible |
| [`components/letters/track.ts`](../../components/letters/track.ts), [`components/letters/letter-context.tsx`](../../components/letters/letter-context.tsx) | What templates call to report taps; silent in the owner's preview |
| [`app/api/open/route.ts`](../../app/api/open/route.ts) | `POST /api/open`, excluded from the middleware |
| [`lib/open/record.ts`](../../lib/open/record.ts), [`lib/open/rules.ts`](../../lib/open/rules.ts), [`lib/open/visitor.ts`](../../lib/open/visitor.ts) | Recording, which events count, the visitor hash |
| [`lib/open/details.ts`](../../lib/open/details.ts) | Place from Cloudflare's data, language, device type, crawlers |
| [`lib/open/timeline.ts`](../../lib/open/timeline.ts) | The owner's events for the Tracker, through row-level security |
| [`app/(app)/dashboard/gifts/page.tsx`](../../app/(app)/dashboard/gifts/page.tsx), [`components/app/gifts-view.tsx`](../../components/app/gifts-view.tsx) | The My gifts tab |
| [`app/(app)/dashboard/tracker/`](../../app/(app)/dashboard/tracker/page.tsx) (page, loading, error), [`components/app/tracker/tracker-view.tsx`](../../components/app/tracker/tracker-view.tsx) | The Tracker tab: the dashboard's layout, the invitation before the first open, the gift list |
| [`components/app/tracker/analytics.ts`](../../components/app/tracker/analytics.ts), [`timeline.ts`](../../components/app/tracker/timeline.ts) | Pure: totals, opens per day and hour, breakdowns, axis ticks and summaries; the timeline's grouping and wording |
| [`headline-numbers.tsx`](../../components/app/tracker/headline-numbers.tsx), [`breakdown-card.tsx`](../../components/app/tracker/breakdown-card.tsx), [`card.tsx`](../../components/app/tracker/card.tsx) | The headline tiles, the country, device and language lists, the card shell (server components) |
| [`time-charts.tsx`](../../components/app/tracker/time-charts.tsx), [`charts.tsx`](../../components/app/tracker/charts.tsx) | The two chart cards with their summaries and hidden tables; the Recharts column chart, loaded with `next/dynamic` |
| [`tracked-gift.tsx`](../../components/app/tracker/tracked-gift.tsx), [`tracker-invite.tsx`](../../components/app/tracker/tracker-invite.tsx), [`use-time-zone.ts`](../../components/app/tracker/use-time-zone.ts), [`use-reduced-motion.ts`](../../components/app/tracker/use-reduced-motion.ts), [`time-zone-note.tsx`](../../components/app/tracker/time-zone-note.tsx) | One gift's row and timeline, the guest invitation, the viewer's timezone and motion preference |
| `letter_events` table, `letter_summaries` view | One row per visitor, event type and door, with place, language and device; the statistics |
| `private.letter_unique_visitors(letter_id)` | The visitor count for `letter_summaries`, for the letter's owner only (0009) |
| `OPEN_HASH_SECRET` | Server-only key for the visitor hash. Without it nothing is recorded |

## Data and privacy

- **Stored per event:** the letter, the event type, the door number (0 when there is none), the visitor hash, the user agent (at most 512 characters), the time, and since [0009](../../supabase/migrations/0009_open_details.sql) the country code, the city, the primary language subtag and the device type, each nullable and checked for format in the database. Never the IP address, region, postal code or coordinates. Rows from before 0009 have no place, language or device. The privacy page says these records are kept for as long as the gift exists; they are deleted with the letter (`on delete cascade`).
- **On the recipient's device:** nothing. No cookies, no `localStorage`, no visitor id. The request carries only the slug, the type and the day; place, language and device come from the request's headers and Cloudflare's data on the server.
- **Who can read it:** the letter's owner, through row-level security on `letter_events` and the `security_invoker` view, and only these columns: `id`, `letter_id`, `type`, `day`, `country`, `city`, `language`, `device`, `created_at`. The visitor hash and the raw user agent are not granted to owners (until 0009 they were); asking for them, or for `*`, is refused. The anon key reads nothing. Only the service-role client writes.
- **The visitor count without the hashes:** `letter_summaries` used to count distinct `visitor_id`s itself, which an invoker view can no longer do. `private.letter_unique_visitors()` counts them instead: `security definer`, `search_path` empty, in a `private` schema the Data API does not expose (calling it through PostgREST answers `PGRST202`), with execute granted only to `authenticated` and `service_role`, and an owner check on `auth.uid()` in its body, so it answers 0 for a letter the caller does not own. A service-role read of the view therefore shows 0 visitors; nothing reads it that way.
- **What the sender sees:** the place, language, device and time of each open on the Tracker, never the visitor number or the user agent. Link previews and page titles of gift pages stay generic. [`/privacy`](../../app/(marketing)/privacy/page.tsx) says what an open records and that only the sender sees it.
- `/api/open` and `/l/` are excluded from the session middleware, so neither reads nor refreshes a session.

## Limits and costs

- Each event is one letter lookup and one upsert on the server, and a body of at most 1,024 characters. Crawlers stop before the lookup. No model calls.
- The Tracker reads the sender's letters and their newest 1,000 events in two queries, and shows at most 100 lines per gift. The visitor count runs one small function per letter inside the view. The headline numbers come from `letter_summaries` and stay complete; the charts and breakdowns count the events read, so for a sender with more than 1,000 events they cover only the newest 1,000.
- JavaScript: the route's first load is 114 kB (192 B of its own; My gifts is 118 kB), measured with `npm run build` on 22 November 2026. Recharts comes in a separate chunk of 371 kB (101 kB gzipped) plus 7 kB (3 kB gzipped) for the Tracker's chart module, fetched after hydration and only by `/dashboard/tracker`; the react-loadable manifest lists `time-charts.tsx -> ./charts` as its only entry.
- There is no rate limit on `/api/open`. Repeats from one visitor add no rows, but someone with the link could inflate the visitor count by changing their user agent.

## How it was checked

- **Unit tests:** [`route.test.ts`](../../tests/unit/app/api/open/route.test.ts) (204 with no body and no cookies, also when recording fails; malformed bodies), [`record.test.ts`](../../tests/unit/lib/open/record.test.ts) (an open as day 0 with a hashed id and never the IP; doors open now; locked doors, unknown, demo and malformed slugs ignored; nothing without the secret), [`rules.test.ts`](../../tests/unit/lib/open/rules.test.ts), [`visitor.test.ts`](../../tests/unit/lib/open/visitor.test.ts) (stable HMAC, different per letter, user agent and secret, no IP inside), [`track.test.ts`](../../tests/unit/components/letters/track.test.ts) (one open per load, nothing in the owner's preview, only slug, type and day sent) and [`qr.test.ts`](../../tests/unit/components/share/qr.test.ts).
- **Tracker unit tests:** [`details.test.ts`](../../tests/unit/lib/open/details.test.ts) (the `request.cf` → `CF-IPCountry` → nothing chain, never coordinates or the IP; language by `q`; phones, tablets and desktops; crawlers, and in-app browsers that are not), [`record.test.ts`](../../tests/unit/lib/open/record.test.ts) (details stored, crawlers ignored without a lookup), [`route.test.ts`](../../tests/unit/app/api/open/route.test.ts) (details passed from the request), [`timeline.test.ts`](../../tests/unit/lib/open/timeline.test.ts) (only granted columns are asked for) and [`components/app/tracker/timeline.test.ts`](../../tests/unit/components/app/tracker/timeline.test.ts) (grouping by day in the viewer's timezone, across a clock change; line titles; place, language and device names; the status line; the guest's sign-up link). The owner's preview stays silent ([`track.test.ts`](../../tests/unit/components/letters/track.test.ts)).
- **Migration 0009**, before it was applied: run after 0001 to 0007 in PGlite (Postgres in WebAssembly) with stand-ins for Supabase's roles and `auth.uid()`, 33 checks: owners read their own rows and the granted columns, are refused `visitor_id`, `user_agent`, `*` and counting visitor ids; counts in `letter_summaries` unchanged; the function answers 0 for another owner's letter; the anon key reads nothing; each format check rejects bad values. The lead then applied it to production with a dry run first and checked with the anon key that `letter_events` and `letter_summaries` are refused (42501) and the function is not exposed (`PGRST202`).
- **Live, 22 November 2026, against production data and `next dev`:** a temporary confirmed user with a letter, a calendar and a postcard made with the service-role key. `curl` posts with an iPhone in German from `DE`, a Windows PC in French from `FR`, an Android tablet in Spanish from `ES` opening doors 1 and 2 and tapping a gift: each row had the right country, language and device and no city (`next dev` has no `request.cf`); a repeat visit, a WhatsApp crawler, a locked door and an unknown slug added nothing; every answer was 204 without cookies. With the user's own token, the granted columns returned only their rows and `visitor_id`, `user_agent` and `*` were refused. The Tracker, signed in as that user, at 375 px and 1440 px: statuses, timelines in Europe/Berlin time, a city line ("São Paulo, Brazil", inserted the way Workers would record it), keyboard (Tab to "Show timeline", Enter and Space open it, rose focus ring), reduced motion (the chevron flips without a transition), no horizontal scroll, no console errors or hydration warnings. A real guest account saw the invitation, and its link opened sign-up with the `next` kept. Opening the gift page in the browser recorded an open through the real beacon. Both accounts were deleted afterwards.
- **The dashboard (issue #75), 22 November 2026:** [`analytics.test.ts`](../../tests/unit/components/app/tracker/analytics.test.ts) covers the totals (drafts left out, doors counted as opens, taps apart, a gift opened per its summary even past the event limit), each gift's numbers, the 30 days in the viewer's timezone (Berlin against New York, the first day shown, older opens dropped, across Berlin's clock change), the 24 hours, the busiest day and hour and the wording on ties, the count-axis ticks, the date labels, the shares, and the breakdowns (ranking, "Other", a single leftover named, "Not recorded", taps not counted). Live against production data and `next dev`, signed in as a temporary user (admin magic link and `verifyOtp`) with letters and events made with the service-role key, in the isolated browser at a true 375 px (emulated viewport, `innerWidth` 375) and at 1440 px: the empty state (zeros, the invitation, the empty charts), a sparse one (two opens of one of two gifts and a draft: 50%, the tie wording) and a busy one (53 opens over three weeks from Germany, France, Spain and Brazil on three gifts and an advent calendar with doors and gift taps). The numbers matched the seeded rows; no horizontal scroll at either width (the hidden tables first widened the page to 432 px, fixed by the wrapper); keyboard: Tab goes header, opens per day, time of day, then each "Show timeline", the arrow keys move the tooltip, the rose ring shows on the chart, the tooltip hides when focus leaves, Enter opens the timeline; mouse hover shows the tooltip and lightens the bar; reduced motion: bars at full height from the first frame (they grow over about 0.7 s otherwise); the accessibility tree reads each chart as an image with its description and the table after it; no console errors or hydration warnings. A real guest session still saw the invitation. Both accounts were deleted afterwards.
- **Not yet checked:** the city from `request.cf` on Workers in production; the Tracker's new loading skeleton in a browser (a throttled client navigation in `next dev` fell back to a full page load and showed the app's own loader instead).
- **Planned end-to-end check** ([docs/plan.md](../plan.md#verification)): open `/l/<slug>` in a private window, see one `open` event and the count on My gifts, and confirm the owner's preview does not count. Whether this was run on production is not recorded here.

## Open questions

- The Tracker shows a flag emoji next to each country, as the issue asked, while [brand.md](../brand.md) says "no emoji in the interface". The flag is hidden from screen readers, which read the country name.
- Unique visitors on the dashboard add up each gift's own count, because the visitor hash includes the letter: the same person on two gifts is two visitors. Counting people across gifts would need a second, letter-free hash, which the privacy page does not cover.
- With more than 1,000 events, the charts and breakdowns cover the newest 1,000 only (the headline numbers stay complete). Counting in the database (a view or function per day, hour, country, device and language) would lift that.
- The keyboard starts each chart on its first bar (the oldest day, or 00:00); Recharts' accessibility layer has no Home or End key, so reaching today takes 29 presses of the right arrow. The hidden table and the summary give the same values at once.
- iPads on iPadOS 13 and later are recorded as desktops; the user agent cannot tell them apart from Macs. Client hints could, but only Chromium sends them.
- A repeat visit records nothing new, so a recipient who opens the gift again from another city does not appear twice unless their network or browser changed.

- A sender opening their own `/l/<slug>` counts as an open; only the owner's preview is excluded.
- A link-preview service that runs JavaScript still counts as a visitor if its user agent looks like an ordinary browser; the ones that name themselves, and headless Chrome, are ignored.
- A per-visitor rate limit on `/api/open` would stop inflated visitor counts.
- Issues still open: [#9](https://github.com/peresramirez/majnu/issues/9) (open tracking and dashboard) and [#21](https://github.com/peresramirez/majnu/issues/21) (share panel), though both are in the code.
