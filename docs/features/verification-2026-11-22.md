# Verification run, 22 November 2026: sign-out, limits, calendars, gift list

## What this is

An end-to-end check of four features that were built but not yet closed: sign-out ([#9](https://github.com/peresramirez/majnu/issues/9)), the spending limits on model routes ([#11](https://github.com/peresramirez/majnu/issues/11)), advent calendars and the owner preview ([#13](https://github.com/peresramirez/majnu/issues/13)), and the gift list on invitations ([#35](https://github.com/peresramirez/majnu/issues/35)). It records what was done, what was seen and whether each check passed, so the issues can be closed (or left open) on evidence. No code was changed: no check turned up a bug that needed fixing in this task.

| Issue | Check | Result |
|---|---|---|
| #9 | Sign out from the account menu; protected pages redirect; cookies gone; sign in again | **Pass** |
| #11 | 6th letter of the day, 41st chat turn, the finder's 4th search of the day: refused with the friendly message and no model call | **Pass** |
| #13 | Calendar starting today: owner preview shows every door, public page shows door 1 only, locked doors absent from the HTML and from every response, the owner preview records nothing | **Pass**, except building the calendar in chat (not run: see below) |
| #35 | Research gifts and add three to a wedding invitation in the letters chat; the invitation shows them; a signed-out guest claims one with a name; My gifts shows who; release | **Pass with the model scripted**: everything except the model's own decisions ran for real (see below) |

## How it was run

- **Code:** branch `task/verify-flows` at `2ab3071` (main before #58). `main` moved to `81a4730` (#58) during the run; that merge changes the main agent's prompt wording, the finder's wrap templates and where a signed-in visitor to `/signin` lands, none of which these checks depend on.
- **Server:** `next dev -p 3123` against the real Supabase project.
- **The model:** the organisation's Anthropic key is over its monthly usage limit (429 until 1 December), so no live model call was made. Instead `ANTHROPIC_BASE_URL` pointed the dev server at a small local stand-in for the Messages API that logs every request it receives. For #9, #11 and #13 it answered every request with an error, and received **none**. For #35 it returned scripted replies in the Messages API's own streaming and JSON formats (details under #35). The route, the tool loop, the tools, the research sub-agent, Tavily, the database and the pages all ran for real; only the model's text and tool choices were scripted.
- **Test user:** a confirmed user `verify-…@example.com` created with the service-role admin API, with a random password kept only in the session's scratchpad. Data was seeded with the service-role key (below).
- **Browser:** the task session's isolated Chrome (`browser` MCP server). Signed-in checks used the real sign-in form with email and password. Guest checks used a second, isolated browser context with no session. Phone width was checked with viewport emulation at 375 × 812, because the window itself cannot be narrower than 500 px (the first screenshots taken by resizing the window were 500 px wide, and the 375 px checks were repeated with emulation). Desktop at 1440 px.

Seeded for the test user, all created "today" (UTC), which makes exactly five letters for the daily limit:

1. A letter whose stored chat has 40 sender messages and 40 replies.
2. An `advent-classic` calendar for "Anna", `startDate` 2026-11-22 (today in Europe/Berlin), `timezone` Europe/Berlin, 24 doors. Each door carries a unique marker (`DOORTITLE-NN`, `DOORMSG-NN`, and on doors 1, 4, 7 … a gift `DOORGIFT-NN` with code `CODE-NN-XYZ`), so a leak would be found with `grep`.
3. A built `wedding-invite` from "Mia & Leo" (event 12 June 2027, Villa Rosa, Berlin) with no gift list.
4. Two empty drafts.

Later, three `finder_searches` rows for the user, for the finder's daily limit.

## #9 Sign-out

**Done:**
1. Signed in at `/signin` with email and password, which landed on `/dashboard/find` with the `sb-<ref>-auth-token` cookie set.
2. Opened the account menu ("Your account") and chose **Sign out**.
3. Then opened `/dashboard`, `/dashboard/find` and `/create/<invitation id>`, and signed in again at 1440 px.

**Seen:**
- The sign-out is the server action `POST /dashboard/find` → **303**, with `set-cookie: sb-<ref>-auth-token=; Path=/; Max-Age=0` and `x-action-redirect: /signin`. The browser landed on `/signin`, and `document.cookie` and storage were both empty.
- All three pages redirected to `/signin` in the browser. Without cookies, `curl` gets **307 → /signin** for each.
- The session was also revoked at Supabase: refreshing with the signed-out session's refresh token answered **400 `refresh_token_not_found`**.
- Signing in again through the form landed on `/dashboard/find` with a new session cookie.
- Console: only messages from inside Cloudflare Turnstile's challenge (error 600010: the automated browser fails the challenge, and the form then goes ahead without a token), as already recorded in [guest-accounts.md](guest-accounts.md).

**Result: pass.** Note on captcha: Supabase answered a password sign-in that carried no captcha token, so captcha protection is still off in Supabase (guest-accounts.md lists switching it on as an owner setting).

## #11 Spending limits

**6th letter of the day.** With five letters created today, I sent "A birthday letter for my sister Lena" from the empty letters chat (`/dashboard`). The answer was `POST /api/chat` → 200 with a finished stream:

```
{"type":"limit","reason":"daily_letters","message":"You have started 5 gifts today, the most for one day. You can start another tomorrow."}
{"type":"done"}
```

The chat showed that sentence as Majnu's notice. The model stand-in received **0 requests**, and the user still had **5** letters, so nothing was created. I repeated it at a true 375 px with the "An advent calendar for my partner" chip, with the same notice, no horizontal scroll and 0 model requests.

**41st turn.** I opened the seeded letter at `/create/<id>`, which showed all 40 earlier messages, and sent "Message 41: one more change please". The chat showed "This gift has had 40 messages, the most one gift can take. Start a new gift to keep going." The server log has `POST /api/chat 200 in 285ms`, the stand-in received **0 requests**, and the stored chat was still **80 messages**, so nothing was appended.

**The finder's daily limit.** The code allows seeding it: searches are counted in `finder_searches`, and a new finder session is refused before any model call when the user already has 3 searches today (`canStartSession()` in [`lib/finder/limits.ts`](../../lib/finder/limits.ts)). With three rows seeded, I sent "A gift for my mother, she loves gardening" from `/dashboard/find`. The finder showed "You have searched for gifts 3 times today, the most for one day. Choose one of the ideas you found, or come back tomorrow for more." `POST /api/finder` → 200. **No finder session was created**, and the stand-in received **0 requests**.

**Result: pass.** Unit tests for both letter limits are in [`tests/unit/lib/limits.test.ts`](../../tests/unit/lib/limits.test.ts), and for the finder's in [`tests/unit/lib/finder/limits.test.ts`](../../tests/unit/lib/finder/limits.test.ts).

## #13 Advent calendars and the owner preview

**Building the calendar.** Not done through the chat. The chat path is not blocked by design: `build_letter` with `advent-classic` is still there, and a real account passes the calendar gate. But it needs the model, and the key is over its limit. The calendar was seeded with the service-role key instead (above).

**Owner preview, `/create/<id>/preview`, signed in:**
- The page says "Every door is open". All 24 doors are labelled "Door N" (door 1 "today"), and the page holds all 24 titles and all 24 messages.
- Door 24 (dated 15 December) opens a sheet with "DOORTITLE-24-Moonlit" and its message.
- The page made **no** `/api/open` request. When the calendar's events were read after the preview visits (including opening door 24), the only rows were the two made a minute later by the `curl` calls below (German, phone). There was nothing from the owner's browser.

**Public page, `/l/<slug>`, as a guest in an isolated browser context:**
- "1 of 24 doors open · The next one opens on 23 November". Door 1 is "today, opened". Doors 2 to 24 are `aria-disabled`, labelled "Door N, opens 23 November" … "opens 15 December", with a lock icon.
- Door 1 opens with its title, message, gift and code.
- No cookie, nothing in local or session storage, no console messages, and no horizontal scroll at 375 px. Checked at 1440 px too.

**`curl` of the public page** (`GET /l/<slug>` → 200, no `Set-Cookie`, `Cache-Control: no-store, must-revalidate`, `<meta name="robots" content="noindex, nofollow, nocache">`, `<meta name="referrer" content="no-referrer">`, title "An advent calendar for Anna"):
- Present: `DOORTITLE-01`, `DOORMSG-01`, `DOORGIFT-01` and `CODE-01-XYZ` (door 1 is open today).
- **Absent:** every marker for doors 2 to 24 (0 matches). In the page's data each locked door is only `{"day":N,"locked":true,"opensOn":"…"}`, for example `{"day":24,"locked":true,"opensOn":"2026-12-15"}`.

**The open beacon** (`POST /api/open` with a phone user agent, because `curl`'s own user agent is ignored as a crawler):

| Body | Answer | Recorded |
|---|---|---|
| `open` | 204, empty body, no `Set-Cookie` | yes, day 0 |
| `door_open`, day 1 | 204, empty body, no `Set-Cookie` | yes, day 1 |
| `door_open`, day 2 (locked) | 204, empty body, no `Set-Cookie` | **no** |
| `gift_click`, day 4 (locked) | 204, empty body, no `Set-Cookie` | **no** |

No response carried any door content. My gifts then showed the calendar as "2 opens · 2 visitors": the `curl` visitor and the guest browser, but not the owner's preview.

**Result: pass** for the owner preview, the locked doors and the beacon. **Not verified:** a 24-door calendar built in the chat, and the builder taking `startDate` and `timezone` from what the browser sends. Both need the model.

## #35 Gift list on a wedding invitation

**The chat, with the model scripted.** On the built invitation's create page (`/create/<id>`), signed in, at 1440 px:

1. "Can you research some gift ideas for us, the wedding couple? We love cooking together. Budget about 100 euros each." The stand-in answered as the main agent, with a sentence and a `research_gifts` call. The route ran the research sub-agent, which made two requests: the stand-in asked for one `search_web`, the route ran it on **Tavily for real**, and the stand-in reported three ideas built from the real results' titles and links (`report_gifts`). The chat showed the three gift cards with prices and "See it" links. The main agent's second request carried the research result back, and the stand-in ended the turn with "Which ones should go on the gift list?".
2. "They all look good, please add the first three to the gift list." The stand-in answered with `update_gift_list` and the three ideas. The tool saved them under the host's own session, the preview reloaded, and the invitation in the preview ended with **Gift list · If you would like to bring something** and the three gifts, with claiming disabled in the owner preview.

The stand-in logged six requests in all, in the expected order: main agent (stream), research twice (JSON), main agent with the research result, main agent for the second message, then with the tool result. `letters.content.wishlist` held the three gifts, each with a server-made 10-character id, the shop link, the price and the description. The invitation's own text was unchanged. The stored conversation was eight messages, saved as returned. In short, every piece of the path ran for real except the model's judgement: which tool to call, and what to pass to it.

**The guest claims one.** As a signed-out guest (isolated context), I opened `/l/<slug>` at 375 px. The list was at the end, with three live **I'll bring this** buttons. I claimed the second gift, typed "Sam" in "Your first name (optional)" and pressed **Yes, I'll bring it**:
- The gift showed "You're bringing this" and "Thank you. Mia & Leo will know you are bringing it.", and the list said "1 of 3 already taken".
- Stored: one `gift_claims` row with `guest_name` "Sam" and a 64-character visitor hash, no IP address. `GET /api/claim?slug=…` answered `{"claimed":["<id>"]}`.
- A second guest (another user agent) claiming the same gift with `curl` got **409** `{"ok":false,"error":"taken","claimed":[…]}`.
- The server's HTML for `/l/<slug>` already said "1 of 3 already taken". After a reload at a true 375 px the gift showed **Taken**, struck through, with no horizontal scroll. The page set no cookie of its own (only Next's development `__next_hmr_refresh_hash__`), nothing in storage, and wrote nothing to the console.

**The host sees and releases it.** On **My gifts** at a true 375 px, signed in as the host, the invitation's card showed "Gift list · 1 of 3 claimed", "Sam is bringing it · just now" and **Release**, with no horizontal scroll and no console messages. Release (`POST /dashboard/gifts` → 200) changed the card to "0 of 3 claimed". The claim row was gone, `GET /api/claim` answered `{"claimed":[]}`, and the public HTML no longer said "already taken".

**Result:** the guest and host halves **pass**, live against the real database. The host half in the chat **passes with the model scripted**. **Not verified:** that the real model, given this conversation, calls `research_gifts` and then `update_gift_list` with the gifts the host chose. That is the last open item on #35; one live conversation after the key is back would close it.

This run also checked live something [gift-list.md](gift-list.md) lists as unverified: taken gifts arrive already marked as taken in the server-rendered HTML.

## Not verified, and why

- **Every model-dependent step** (the key is over its monthly limit until 1 December, and the lead asked for no live calls):
  - building a calendar in chat (#13);
  - the builder setting `startDate` and `timezone` from the browser (#13);
  - the main agent offering a calendar after a letter is shared (#13);
  - the real model choosing `research_gifts` and then `update_gift_list` (#35).
- **Keyboard and reduced motion** were not re-run here. The claim form's keyboard handling and the calendar's were checked when they were built (see [gift-list.md](gift-list.md) and [templates-and-gift-pages.md](templates-and-gift-pages.md)).
- **Production** (`majnu.app`): everything here ran on `next dev`. Nothing was deployed.

## Things noticed on the way (no change made)

These are outside this task's files. They are listed for the lead to pass on or turn into issues.

1. **A gift with no stored chat opens with the "New gift" starter.** `/create/<id>` for a built letter whose `chat` is empty shows "NEW GIFT · Who is it for?" and the three starter chips above a finished gift. Seeded letters do this, but so do gifts wrapped in the finder: [`lib/finder/wrap.ts`](../../lib/finder/wrap.ts) creates the letter and saves its content without a conversation, and My gifts links to `/create/<id>` with **Continue**.
2. **Group names in copy.** With the sender "Mia & Leo", the claim form says "Only Mia & Leo sees it." (should be "see"). With the recipient "our friends", the voice-note panel says "our hears it", and the page title is "An invitation for our". Each takes the first word of the recipient's name, which reads badly for invitations addressed to a group.
3. **The finder's limit notice is announced twice.** It sits in two live regions (the message's status and the paragraph under the composer), so a screen reader may read it twice.
4. **After a refused 6th letter** the chat header still reads "New gift · In progress", although nothing was created.
5. **A stale open question.** [gift-list.md](gift-list.md) says the middleware still runs on `/api/claim`, but [`middleware.ts`](../../middleware.ts) already excludes it.
6. **Captcha protection is off in Supabase** (a password sign-in without a token succeeds), as guest-accounts.md already notes.

## Clean-up

The test user was deleted with the service-role admin API (`DELETE /auth/v1/admin/users/<id>` → 200; a later lookup → 404). Afterwards I counted, for that user and its five letters:
- `letters`, `letter_events`, `gift_claims` and `letter_audio_notes`;
- `letter_designs`, `finder_sessions`, `finder_searches` and `voice_transcriptions`;
- `audio_note_uploads`, `purchases` and `profiles`.

Every one had **0** rows. No voice note was recorded, so the audio bucket was not touched. The dev server and the model stand-in were stopped, and both ports are free.
