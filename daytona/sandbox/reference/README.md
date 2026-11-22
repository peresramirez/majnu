# Reference material

Copies of the Majnu app's own files, put here when the sandbox snapshot was built. They show what a letter contains and how our templates present it. They are for reading only: the page you make is plain HTML, CSS and JavaScript, with no React and no build step.

- `lib/letters/schema.ts`: the content schema. `LetterContent` is the shape of `input/content.json`.
- `lib/letters/fixtures.ts`: one realistic sample content per template.
- `components/letters/registry.tsx`: which component renders which template id.
- `components/letters/templates/`: the letter templates.
  - `classic-envelope.tsx`: a sealed envelope that opens into a letter.
  - `gift-reveal.tsx`: a wrapped box the recipient taps to unwrap, then a gift card with the code.
  - `invitation.tsx`: wedding (elegant) and party (playful) invitations with date, time and place.
  - `postcard.tsx`: a postcard that flips over.
- `components/letters/gift-card.tsx`: how a gift is shown, and how its code stays out of the page until the recipient taps.
- `components/letters/theme.ts`: the colours behind each palette mood (`night`, `petal`, `rose`, `sage`, `ink`) and font mood.
- `components/letters/event-time.ts`: how an event's date and time are written out in the letter's language.
- `components/calendars/`: the advent and countdown calendars. Calendars are never redesigned; they are here only for completeness.
- `rendered/<template-id>.html`: each template rendered with its sample content, as the server sends it before any tap, with scripts and stylesheets removed. The look comes from Tailwind class names and the CSS variables set in `style` attributes (see `theme.ts`).
