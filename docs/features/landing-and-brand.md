# Landing page, brand and legal pages

## What it does

The landing page at `majnu.app` tells a visitor from an ad what Majnu does in one screen, shows real examples they can open, and gives the price. Its main image is a painting of Majnu giving Layla the moon, with our own moon on top that travels from his hands to hers as the visitor scrolls. The site around every gift follows one brand, **Night Post**. The Impressum, privacy policy and terms, required before ads run in Germany, are written in the same voice.

## How it works

```mermaid
flowchart TD
  ad(["Visitor from an ad"]) --> landing["Landing page /<br/>app/(marketing)/page.tsx"]
  landing --> hero["Hero: Give something personal"]
  landing --> how["How it works: pinned, one step at a time,<br/>the moon travels with the scroll"]
  landing --> send["What you can send:<br/>TemplateCard thumbnails"]
  landing --> pricing["Pricing from lib/plans.ts"]
  landing --> faq["Questions"]
  send -->|"open an example"| demo["/l/demo-letter, /l/demo-gift, /l/demo-calendar"]
  hero -->|"Create a gift"| signin["/signin"]
  pricing -->|"Find a gift"| hero
  landing --> footer["Footer: Privacy, Terms, Impressum"]
```

The page, top to bottom ([`app/(marketing)/page.tsx`](../../app/(marketing)/page.tsx)):

1. **Header** with the wordmark, links to "How it works" and "Pricing", and "Sign in".
2. **Hero:** "Personalized digital gifting", the headline "Give something personal.", a primary **Create a gift** button to `/signin` and "See how it works". Under it: "Free to start. Nothing to install for the person you send it to."
3. **How it works** ([`how-it-works.tsx`](../../components/landing/how-it-works.tsx)): one line ("Majnu would have given Layla the moon. Yours takes three steps.") and three steps, told one at a time while the section stays pinned: Say who it is for; Choose from three gifts; Wrap it, send the link. Each is a large title and one line; as the visitor scrolls, the step on screen lifts and blurs away like mist and the next one settles in, while the moon travels from Majnu to Layla (see [How it works](#how-it-works-1) below). On desktop the painting is pinned behind the hero and the story; on phones it is part of the story's pinned screen.
4. **What you can send:** gift, letter, invitation and advent calendar, with their plan, and three examples drawn with `<TemplateCard>` that open the demo pages. The demo slugs always resolve to the same fixtures as the thumbnails ([templates-and-gift-pages.md](templates-and-gift-pages.md#demo-slugs)).
5. **Pricing:** two cards read from [`lib/plans.ts`](../../lib/plans.ts): Free (€0, everything that makes Majnu useful) and the personalised wrapper (€2.99 once, for one gift, bought with "Make it unique" on a wrapped gift; [billing.md](billing.md)). Prices include VAT; nothing renews.
6. **Questions:** whether you need an account, where the ideas come from, location, whether the recipient needs an account, who can see a gift, what Majnu costs and what happens when you buy a personalised wrapper.
7. A closing call to action and the site footer ([`site-footer.tsx`](../../components/landing/site-footer.tsx)) with Privacy, Terms and Impressum.

Sections below the fold play in as they scroll into view ([`reveal.tsx`](../../components/landing/reveal.tsx)). Content is hidden only after hydration and only while still below the fold, so with reduced motion, or without JavaScript, everything stays visible.

### How it works

Until 22 November the section was three cards with small pictures that scrolled past. The developer asked for it to be told as a story instead (issue #73): the section pins, shows one step at a time as text only, changes step with a striking effect as the visitor scrolls, keeps the scene moving the whole time, and lets the page scroll on after the last step.

```mermaid
flowchart LR
  scroll(["scroll event<br/>(passive)"]) --> raf["requestAnimationFrame:<br/>read scrollY, ease towards it"]
  raf -->|"one CSS variable"| u["--u on the section<br/>(steps of scroll since it pinned)"]
  u --> css["app/globals.css: each letter's<br/>transform, opacity, blur"]
  u --> marks["the three moon marks"]
  scroll --> scene["GiftScene reads scrollY<br/>against the data-moon marks"]
  scene --> moon["the moon's place and phase"]
```

- **The track.** The section is one screen tall plus 0.8 of a screen of scroll per step (340 svh in all). Its screen is `position: sticky`, so it stays put for 2.4 screens of scrolling and lets go when the track ends; the next section follows directly, with no gap. Heights use `svh`, the small viewport, so Safari's toolbar showing and hiding never resizes the pinned screen.
- **The timeline** lives in [`how-it-works-steps.ts`](../../components/landing/how-it-works-steps.ts), with the steps' words. It is measured in steps of scroll: 0 where the section pins, 3 where it lets go. The first step settles while the section scrolls into view; the change from step 1 to 2 happens around 0.92 and from 2 to 3 around 2.08, each taking 0.36 of a step's scroll for the old step to leave and as much for the new one to arrive (they overlap by 0.06 in the middle). That leaves each step at rest for about 0.6 of a step's scroll. The last step never leaves; it scrolls away with the section. The unit test checks these rules.
- **One variable.** [`how-it-works.tsx`](../../components/landing/how-it-works.tsx) reads `scrollY` in a passive `scroll` listener, and at most once a frame eases towards it (about 70 ms behind, the same at 60 and 120 Hz) and writes `--u`. It writes it on each step and each progress mark rather than once on the section, held still outside that step's entrance and exit (`stepPosition` in the steps file), and skips the write when the value has not changed. A frame therefore restyles only the letters that are moving, and nothing while a step rests: on a phone with the CPU slowed four times, style work went from 6.8 ms to 1.0 ms a frame. `scrollY` is read in the scroll event, not in the frame, because Chrome recalculates styles when it is read after a style write. The section's place in the page is measured only when something resizes (a `ResizeObserver` on the section and the body). The loop stops when `--u` has arrived.
- **The effect, in CSS** ([`app/globals.css`](../../app/globals.css)). Each title is split into letters and each line into words, all `inline-block` spans with a place in the wave (`--c`) and a small random drift (`--r`, the same on the server and in the browser). From `--u` and the step's `--enter` and `--leave`, each letter works out how far it has arrived and how far it has left. Leaving, it eases in, like mist in moonlight: it drifts up and a little to one side, turns, grows by 15%, blurs and fades, letter after letter from left to right. Arriving, it eases out: it rises half a line into place and comes into focus. Only `transform`, `opacity` and `filter` change. The values are registered with `@property` as numbers, so the browser works each one out once per letter.
- **Progress.** Three small moons beside the heading, one per step with its phase (0.22, 0.55, full). The current one is lit in rose gold and slightly larger; it lights up as its step arrives and dims as it leaves.
- **Story mode is CSS only:** it applies under `@media (prefers-reduced-motion: no-preference) and (scripting: enabled)`. With reduced motion, without JavaScript, or in a browser that does not know the `scripting` feature (Safari before 17, Chrome before 120), the same markup is the plain list its Tailwind classes describe: the heading, the line and the three steps, each with its moon phase. Nothing pins and nothing moves, and nothing jumps when the page hydrates, because the choice is made before the first paint. The story-mode rules are scoped under `.story` so they win over Tailwind's responsive classes, which Tailwind appends after the file.
- **Accessibility and search.** Every step is in the page, in order, as real text: an `h2`, the line, and an ordered list of three `h3` headings with their lines. In story mode that text is visually hidden (the usual screen-reader-only clip), never `display: none`, and what people see is an `aria-hidden` copy split into letters, so a screen reader never spells a title out letter by letter. Search engines see both. The heading is set in capitals in story mode, which Chrome passes on to screen readers, so it carries `aria-label="How it works"`. The section has nothing to focus, so Tab goes from the hero's last suggestion straight to the first example below it. The header's "How it works" link (`#how`) lands at the top of the track, where the first step is on screen.
- **Layout.**

  | Width | Story mode |
  |---|---|
  | Under 768 px | The pinned screen is a column: the heading, the line and the marks at the top, the scene filling the middle (it fades into the page above and below), the step at the bottom, clear of Safari's floating toolbar (`padding-bottom: max(28px, var(--safe-bottom) + 16px)`) |
  | 768 to 1279 px | A 448 px column on the left of the pinned painting, centred on the screen, so Majnu stays in view |
  | 1280 px and up | A 576 px column |

  Titles are Gilda Display at 34 to 46 px on phones and 46 to 72 px from 768 px; the line is 17 or 19 px in Lilac haze.

### The scroll scene

[`<GiftScene>`](../../components/landing/gift-scene.tsx) draws the moon in the painting's own coordinates (2048 × 1152), so it stays on the couple whatever the crop:

- The painting was generated with FLUX and is served as WebP at 1280 and 2048 pixels wide from [`public/landing/`](../../public/landing/).
- The moon follows a quadratic curve from the light above Majnu's cupped hands, over an arc, to Layla's open palm. Its radius grows from 9 to 46 and shrinks to 15 as it lands, and it fills from a crescent to full on the way.
- Scroll progress is read on `scroll` (a passive listener) and eased towards with `requestAnimationFrame`, which stops when the moon has arrived.
- **The journey follows the story.** How it works places four invisible marks in its track (`data-moon`, from `moonMarks` in [`how-it-works-steps.ts`](../../components/landing/how-it-works-steps.ts)), each with the moon's progress when it reaches the top of the screen: 0 when the section starts to come into view from below (on desktop, the top of the page), 0.2 when it pins with the first step, 0.5 (the top of the arc, half lit) as the second step settles, and 1 (on Layla's palm, full) as the last step settles. In between it moves evenly. The scene measures the marks' places in the page when the track resizes and, while scrolling, reads only `scrollY`, in the scroll event. The marks and the scene both sit inside `data-gift-track`, the hero and How it works together.
- **Variants:** `backdrop` pinned behind the hero and How it works (desktop), `story`, which fills its box inside How it works' pinned screen, zoomed 1.28 times and centred on the couple, with its top and bottom fading into the page through a mask (phones), and `panel`, which fills its parent with the moon already given (sign-in and sign-up, [`app/(auth)/layout.tsx`](../../app/(auth)/layout.tsx), beside the line "Majnu would have given Layla the moon."). A hidden variant (the backdrop on phones, the story from 768 px) does no work while scrolling.
- **The moon breathes** while nobody scrolls: the drawing's opacity goes from 0.8 to 1 and back over 7 seconds, an animation on the `<svg>` element that the compositor runs without the main thread.
- **The page behind.** The hero's glow (a radial gradient on the track) is sized in pixels (1440 px tall, centred 325 px from the top), as it was at the track's old height, so the much taller track does not stretch it; it fades to Plum, the colour of the next section.
- With `prefers-reduced-motion`, nothing moves: the scene shows its final state, the full moon in Layla's hand.

## The Night Post brand

Everything is in [docs/brand.md](../brand.md); in short:

- **The name and the story.** In Arabic, Layla means night, and in the old story Majnu writes poems for Layla. Every gift goes out like a letter under the moon: calm, elegant and personal.
- **Logo.** MAJNU in wide capitals with a rose-gold crescent above the J, drawn as vector outlines. Use the files in [`public/brand/`](../../public/brand/) (or the [`Wordmark`](../../components/brand/wordmark.tsx) component), never retype it in a font. The crescent alone is the mark, for icons and avatars, and it never sits next to a star.
- **Colour.** Dark by default (Plum night): Plum `#1B1226` ground, Velvet `#2A1C3A` panels, Petal white `#F5EAF1` text, Lilac haze `#BCA8C4` secondary text, Rose gold `#EAB394` for the one thing to do, Orchid `#CD8DBD` at most once a screen. Forms, the legal pages and long reading may use the light Petal palette. In code they are Tailwind's `night` and `day` colours ([`tailwind.config.ts`](../../tailwind.config.ts)).
- **Type.** Gilda Display for headlines (400 only, sentence case) and Hanken Grotesk for everything people read and tap, self-hosted from files in the repository (see [Fonts](#fonts) below).
- **The moon** is the main image: phases mark progress, the advent calendar's doors fill one step a day, and stars are small and still.
- **Motion** is slow and calm, with one easing curve (`cubic-bezier(0.22, 0.61, 0.36, 1)`) and no bounces; every screen works without animation.
- **Voice.** Write to one person. Short sentences, plain words, sentence case. No exclamation marks, no emoji in the interface, never "magic", "AI-powered" or "unlock". The main action is always **Create a gift**. The main agent's system prompt carries the same rules ([letters-chat.md](letters-chat.md)).

Letter and calendar templates are the sender's gift, not our page, so they may have their own palettes and type; the chrome around them (the share panel, the "made with Majnu" footer, link previews) follows the brand. The logo files, icons and the site's link-preview image are generated by [`scripts/brand/build-brand.mjs`](../../scripts/brand/build-brand.mjs); change colours there and regenerate rather than editing SVGs by hand.

## Fonts

Every typeface is a `.woff2` file committed in [`app/fonts/files/`](../../app/fonts/files/) and loaded with `next/font/local` in [`app/fonts.ts`](../../app/fonts.ts). The build never contacts Google Fonts. Until 21 November it used `next/font/google`, which downloads the fonts during every build, and CI failed whenever Google did not answer in time ("Cannot read properties of null (reading '1')").

```mermaid
flowchart LR
  gf["google/fonts repository<br/>(pinned commit)"] -->|"app/fonts/build.py, run by hand"| files["app/fonts/files/*.woff2<br/>committed, with LICENSES.md"]
  files -->|"next/font/local at build time"| media["/_next/static/media/*.woff2<br/>+ @font-face CSS"]
  media -->|"same origin"| browser["Visitor's browser"]
```

| Export | CSS variable | Face | Files | Preloaded |
|---|---|---|---|---|
| `display` | `--font-display` | Gilda Display 400 | latin | yes |
| `sans` | `--font-sans` | Hanken Grotesk 400, 500, 600 (one variable file) | latin | yes |
| `letterSerifDisplay` | `--font-letter-serif-display` | Cormorant Garamond 500, 600, roman and italic | latin, latin-ext | no |
| `letterSerif` | `--font-letter-serif` | EB Garamond 400, 500, roman and italic | latin, latin-ext | no |
| `letterSansDisplay` | `--font-letter-sans-display` | Bricolage Grotesque 200 to 800 | latin, latin-ext | no |
| `letterScript` | `--font-letter-script` | Caveat 400 to 700 | latin, latin-ext | no |
| `letterCalligraphy` | `--font-letter-calligraphy` | Pinyon Script 400 | latin, latin-ext | no |

- **The files are cut the way Google cuts them**, by [`app/fonts/build.py`](../../app/fonts/build.py) from the fonts in the Google Fonts repository: Google's latin and latin-ext character ranges, the OpenType features Google keeps (including tabular and lining figures), no hinting, and axes next/font did not ask for pinned where Google pins them (Bricolage's optical size at 14, not the font's default of 96). The variable fonts are limited to the weights in use, which keeps Hanken Grotesk, preloaded on every page, at 22 KB instead of Google's 34 KB. The script pins the google/fonts commit and gives the same bytes on every run; run it only to change a face, weight or subset, then update `app/fonts.ts` and `LICENSES.md`.
- **Latin-ext is downloaded only when a letter needs it.** Each template face is declared as one font family from two `localFont` calls: the latin file and the latin-ext file, each with its own `unicode-range`, as in Google's own CSS. A letter in English or German loads only the latin files. The latin-ext halves are not exported; `letterFontVariables` includes their (unused) variables so next/font keeps their `@font-face` rules, because it drops a font call that nothing references.
- **The CSS family names** are the export names (`display`, `sans`, `letterSerif` and so on), each with a size-adjusted fallback (`'sans Fallback'`, based on Arial or Times New Roman as before) so text does not jump when the font arrives.
- **Licences.** All seven families are under the SIL Open Font License 1.1; [`app/fonts/files/LICENSES.md`](../../app/fonts/files/LICENSES.md) names each family, its copyright and source, and carries the licence text. Gilda Display reserves the name "Gilda" for unmodified copies, so our subset is called Majnu Display inside the file.

## Legal pages

| Route | File | What it holds |
|---|---|---|
| `/impressum` | [`app/(marketing)/impressum/page.tsx`](../../app/(marketing)/impressum/page.tsx) | Who runs Majnu, as German law requires |
| `/privacy` | [`app/(marketing)/privacy/page.tsx`](../../app/(marketing)/privacy/page.tsx) | What is collected and why, cookies, open tracking, gift pages, processors, transfers outside the EU, retention, rights |
| `/terms` | [`app/(marketing)/terms/page.tsx`](../../app/(marketing)/terms/page.tsx) | The terms of use, of the personalised wrapper and the right of withdrawal |

- All three read the operator's name, address and email from [`lib/legal.ts`](../../lib/legal.ts), which also holds the date of the last change (`legalUpdated`). The name must match the Stripe account. `npm run deploy` refuses to deploy while `lib/legal.ts` has a bracketed placeholder.
- They share [`<LegalPage>`](../../components/legal/legal-page.tsx), on the light Petal palette for long reading.
- The privacy page names Supabase (Frankfurt), Cloudflare, Anthropic, Google, Stripe and Tavily as processors. It says there are no analytics, advertising or tracking cookies, that the only cookie keeps a user signed in and the only stored setting is light or dark mode (both strictly necessary under § 25 (2) TDDDG, so there is no banner), and that gift pages set none. It describes open tracking as it is built ([sharing-and-tracking.md](sharing-and-tracking.md#the-visitor-hash)). If open tracking changes, this page changes in the same commit.
- `hello@majnu.app` is forwarded to the operator's inbox by Cloudflare Email Routing ([docs/setup.md](../setup.md#services)). The app itself sends no email.

## Pieces

| Piece | Job |
|---|---|
| [`app/(marketing)/page.tsx`](../../app/(marketing)/page.tsx) | The landing page |
| [`components/landing/`](../../components/landing/) | The scroll scene, How it works with its steps, the reveal effect and the site footer |
| [`components/brand/`](../../components/brand/) | The wordmark and the moon-phase drawing used across the site and the templates |
| [`app/(auth)/layout.tsx`](../../app/(auth)/layout.tsx), [`app/(auth)/signin/page.tsx`](../../app/(auth)/signin/page.tsx), [`app/(auth)/signup/page.tsx`](../../app/(auth)/signup/page.tsx) | Sign-in and sign-up beside the scene, by email and password or Google |
| [`app/(marketing)/impressum/page.tsx`](../../app/(marketing)/impressum/page.tsx), [`app/(marketing)/privacy/page.tsx`](../../app/(marketing)/privacy/page.tsx), [`app/(marketing)/terms/page.tsx`](../../app/(marketing)/terms/page.tsx), [`lib/legal.ts`](../../lib/legal.ts) | The legal pages and the operator's details |
| [`app/layout.tsx`](../../app/layout.tsx), [`lib/site.ts`](../../lib/site.ts) | Site-wide metadata: name, description, URL |
| [`app/fonts.ts`](../../app/fonts.ts) | Every typeface, loaded with `next/font/local`, and the CSS variables the site and the templates use |
| [`app/fonts/files/`](../../app/fonts/files/), [`app/fonts/build.py`](../../app/fonts/build.py) | The committed font files with their licences, and the script that makes them from the Google Fonts repository |
| [`public/brand/`](../../public/brand/), [`app/icon.svg`](../../app/icon.svg), [`app/apple-icon.png`](../../app/apple-icon.png), [`app/opengraph-image.png`](../../app/opengraph-image.png) | Logo files, icons and the site's link-preview image |
| [`docs/brand.md`](../brand.md) | The brand guidelines |

## Data and privacy

- The landing page collects nothing: no analytics, no third-party scripts, and fonts served from our own domain. Neither the build nor a visitor's browser contacts Google Fonts.
- Signing in sets Supabase's session cookie, which is strictly necessary. The theme setting is stored in the browser.
- The painting and the brand assets are static files.

## Limits and costs

- The landing and sign-in pages are prerendered and served from the build's static assets ([`open-next.config.ts`](../../open-next.config.ts)). Setup measured cached pages at 1 to 3 ms of CPU, well within the Workers Free limit of 10 ms ([docs/setup.md](../setup.md#services)).
- The painting is the largest download; phones get the 1280-pixel WebP.
- Fonts: every page preloads 35 KB (Gilda Display 13 KB, Hanken Grotesk 22 KB). A letter adds only the faces its mood uses, 27 to 74 KB each for latin; the latin-ext files (17 to 99 KB) load only for text that needs them. The 16 files in the repository total 656 KB.

## How it was checked

- How it works as a pinned story (issue #73, 22 November): see [How it was checked: the pinned story](#how-it-was-checked-the-pinned-story) below.
- Apart from that, no unit tests cover the landing page itself. The `TemplateCard` data has a test, and the demo slugs are tested to point at templates of the right kind ([`fixtures.test.ts`](../../tests/unit/lib/letters/fixtures.test.ts)).
- Browser checks of the page, the scene and the legal pages (375 px and 1440 px, keyboard, reduced motion) are part of every task's verification, but their results are not recorded in the repository. The screenshots in `media/` come from the starter template and do not show Majnu.
- Self-hosted fonts (21 November): every font file was compared glyph by glyph with the file Google Fonts serves for the same request. Outlines and advance widths match within 1.3 font units (about 0.02 px at 16 px), the OpenType features are the same, and no character in Google's advertised ranges is missing. In a browser, the landing page, `/signin`, `/l/demo-letter` (opened) and `/dev/templates` laid out identically to majnu.app at 375 px and 1440 px (the same text widths and heights per font; one Cormorant line on the landing page 1 px narrower), and the network panel showed fonts only from our own domain. `npm run build` passed with `fonts.googleapis.com` and `fonts.gstatic.com` unreachable.

### How it was checked: the pinned story

Issue #73, 22 November, in the `browser` MCP server's Chrome, on `next dev` and then on the production build (`next start`):

- **Unit tests** ([`how-it-works.test.ts`](../../tests/unit/components/landing/how-it-works.test.ts)): the words (three steps, short titles and lines, the moon filling to full, no exclamation marks) and the timeline (about one screen of scroll per step; the first step settled when the section pins; the old step mostly gone before the new one arrives and fully gone before it settles; the last step never leaves; every step rests for at least half a step's scroll; the moon's marks move forward, reach the top of the arc as the second step settles and land, full, as the last one settles; `stepPosition` stands still exactly where a step's letters do).
- **1440 × 900, 1024 × 768, 700 × 1000, 375 × 667, 375 × 548 and 320 × 568** (true phone widths with device emulation): the section pins, one step at a time, the step in the middle of a change lifting and blurring away letter by letter while the next settles in, and no horizontal scroll at any width. At 1440 × 900 the section is 3,060 px tall (2,160 px of pinned scrolling, 720 px per step); at 375 × 667 it is 2,268 px (534 px per step).
- **The moon**, read from the drawing while scrolling at 1440 px: in Majnu's hands (1452, 486) at the top of the page, rising (1457, 337) as the section pins, at the top of its arc (1466, 254) as the second step settles, and on Layla's palm (1489, 489) as the third settles, where it stays.
- **The release:** at the end of the track the pinned screen's bottom, the track's bottom and the next section's top were the same pixel (450 px at 1440, 334 px at 375), with no gap, jump or change of colour.
- **Safari's toolbar, simulated** as for the app shell: `--toolbar-overlap` forced to 32 px and a 45 px pill whose top is 24 px above the bottom of the screen. At 375 × 548 the step's last line ends at 500 px, 24 px above the pill.
- **Reduced motion** (emulated): the section is a plain list, 965 px tall at 375 px and 438 px at 1440 px, nothing pinned or moving, and the moon already in Layla's hand.
- **Accessibility:** the accessibility tree reads the region "How it works", its line, and three level-3 headings with their lines, in order. Tab from the hero's last suggestion goes straight to the first example below the story. The header's "How it works" link scrolls to the top of the track with the first step on screen (`--u` 0).
- **Performance** (traces while scrolling the whole section 10 to 14 px at a time, production build): no long task from the page; the only one over 50 ms was the tracing tool's own script at the start. At 1440 px unthrottled, style work was 1.2 ms a frame and no style recalculation was forced inside an animation frame. At 375 px with the CPU slowed four times: 56 frames a second, style work 1.0 ms a frame, the page's longest frame about 10 ms. Layout shift (CLS) 0.
- **The console** showed no errors or warnings.
- **Screenshots:** [screenshots/how-it-works-story/](screenshots/how-it-works-story/) (each step and a change between steps at 375 and 1440 px, the release at 1440 px, reduced motion at 375 px).
- **Not checked:** a real iPhone. Chrome cannot show Safari's toolbar collapsing and expanding, so whether the pinned screen stays perfectly still then (it is sized in `svh` for that reason) and how Safari handles blur on many letters at once are for the developer to check after the deploy. Also not checked: Firefox and Safari on a desktop, and a browser with JavaScript turned off (the list is chosen by `(scripting: enabled)` in CSS, which Chrome cannot switch off from the tools used here).

## Open questions

- The hero gets the gift finder's chat box, as the main flow now starts there ([#32](https://github.com/peresramirez/majnu/issues/32)).
- Before the finder goes live, the privacy page must name Cloudflare Turnstile, Apify and anonymous accounts ([#33](https://github.com/peresramirez/majnu/issues/33)), and before the Daytona redesign is offered, Daytona.
- How it works splits each title into letters, and letters in separate boxes lose the font's kerning between them, so a few pairs may sit a touch wider than in plain text. Splitting into words would keep it, at the cost of a less misty exit.
- A change between steps takes about half a screen of scroll, so a quick flick on a phone can pass a step in one movement. Snapping to steps was left out, because it fights the browser's own scrolling, most of all on iPhones.
- [docs/brand.md](../brand.md#motion) asks for a still **half** moon with reduced motion; the scene shows the full moon already given. One of the two should change.
- The brand pass on the sign-in pages, favicon and landing examples is still open ([#24](https://github.com/peresramirez/majnu/issues/24)).
- **Fewer scripts than before.** `next/font/google` also self-hosted every other subset Google has (latin-ext for Gilda Display and Hanken Grotesk; cyrillic, greek and vietnamese for several letter faces) and loaded them on demand. Now Gilda Display and Hanken Grotesk cover latin only, so a name like "Łucja" in the site chrome shows its "Ł" in the fallback font, and Cyrillic, Greek and Vietnamese text in letters uses the system font. Adding latin-ext to the two site fonts would cost about 8 KB in the preloaded files.
- [`docs/brand.md`](../brand.md) still says to load the fonts with `next/font/google`.
