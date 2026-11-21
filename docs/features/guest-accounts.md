# Guest accounts, upgrading, the bot check and the app tabs

## What it does

Visitors can use Majnu without signing up. The gift finder gives them an invisible **guest account** (a Supabase anonymous user), and from then on they use the app like anyone else: they own the gifts they wrap, see them under My gifts, and share them. A quiet line in the app asks them to create an account; when they do, with email or Google, the guest account itself becomes the real account, so nothing is lost. Advent calendars need a real account. Email sign-in and sign-up carry an invisible Cloudflare Turnstile token, so captcha protection can be switched on in Supabase without breaking them. The app has four tabs: **Find a gift**, **Letters & invitations**, **My gifts** and **Plan**.

## How it works

```mermaid
flowchart LR
  subgraph Browser
    F[Gift finder<br/>signInAnonymously + Turnstile token]
    SU[/signup form/]
    SI[/signin form/]
    T[Turnstile widget<br/>invisible]
  end
  subgraph Worker[Next.js on Cloudflare]
    MW[middleware.ts<br/>routeAccess]
    GA[signInWithGoogle<br/>server action]
    CB[/auth/callback/]
    APP[(app) shell<br/>4 tabs + guest notice]
    LIM[lib/limits.ts<br/>calendar gate]
  end
  SB[(Supabase Auth)]
  CF[Cloudflare Turnstile]
  G[Google]

  T -- token --> SU & SI
  F -- anonymous sign-in --> SB
  SU -- "guest: updateUser(email, password)<br/>else: signUp + captchaToken" --> SB
  SI -- signInWithPassword + captchaToken --> SB
  SB -- verifies token --> CF
  SU & SI -- Continue with Google --> GA
  GA -- "guest: linkIdentity<br/>else: signInWithOAuth" --> SB --> G --> CB
  CB -- exchangeCodeForSession --> SB
  CB -- "refused link: /signin?auth_error=code" --> SI
  MW --> APP
  APP --> LIM
```

**A guest arrives.** The finder (issues #31 and #32) calls `signInAnonymously` with a Turnstile token on the visitor's first message. Supabase creates a user with `is_anonymous = true` and sets the usual session cookies. `lib/supabase/middleware.ts` refreshes the session on every request and asks `routeAccess(pathname, user)` what to do:

| | Signed out | Guest | Real user |
|---|---|---|---|
| `/dashboard/**`, `/create/**` | to `/signin` | open | open |
| `/signin`, `/signup` | open | open (so they can upgrade) | to `next` or `/dashboard` |
| everything else | open | open | open |

`is_anonymous` comes from `getUser()`, which asks Supabase Auth, so it is current even when the token in the cookie is older than an upgrade.

**The app shell** (`components/app/app-shell.tsx`) shows the four tabs from `components/app/tabs.ts`: top tabs from `md` up, a bottom bar on phones (where "Letters & invitations" shows as "Letters", with the rest read to screen readers). `/dashboard` is still the letters chat, so every existing link to it (the default after sign-in, emails, "New gift" buttons) opens the same screen; Find a gift is the new `/dashboard/find`, which for now invites the visitor to the finder on the landing page and is kept thin so the finder can be mounted there. For guests, `getSignedInUser()` returns `isGuest: true`, the shell adds the line "You're using Majnu as a guest. Create an account to keep your gifts." under the header, and the account menu offers Create an account and Sign in.

**Upgrading with email** (`components/auth/email-auth.ts`, run in the browser). `signUpWithEmail` asks Supabase who the user is. For a guest it calls `updateUser({ email, password }, { emailRedirectTo })`: the password is set at once, and the email waits for confirmation. Supabase emails a link that lands on `/auth/callback?next=...`, which exchanges the code for a session in this browser; the account is now a real one with the same user id. For everyone else it calls `signUp` with the Turnstile token, as before.

**Upgrading with Google** (`app/auth/actions.ts`). `signInWithGoogle` checks the user on the server. A guest gets `linkIdentity({ provider: "google" })`, which adds Google to the guest account; anyone else gets `signInWithOAuth`. If linking is refused, the guest sees why and can choose **Sign in with Google anyway** (`switchAccount`), which signs in to that Google account's own Majnu account and leaves the guest account behind:

- *Manual linking is off in Supabase*: `linkIdentity` fails at once with `manual_linking_disabled`; the form says so and suggests email.
- *The Google account already has a Majnu account*: Google sends the browser back to `/auth/callback?error_code=identity_already_exists`, which redirects to `/signin?auth_error=identity_already_exists`.

The callback passes on only short snake_case codes, and the sign-in form shows only messages we wrote (`components/auth/auth-errors.ts`), never text from the URL. A code that cannot be exchanged in this browser (an email link opened in a mail app's own browser, for example) leads to `/signin?auth_error=exchange_failed`: "Your link worked, but this browser couldn't finish signing you in."

**The bot check** (`components/auth/turnstile.ts`). `useTurnstile(action)` loads Cloudflare's script explicitly, renders the widget (invisible mode is set on the widget in Cloudflare) as soon as the form appears, and keeps the latest token. `getToken()` returns it, waits up to 10 seconds for the first one, and resolves to `undefined` at once when there is no site key, the script is blocked, or the last check failed; the form then goes ahead without a token. After each submit `reset()` fetches a fresh token, because a token is valid once. Email sign-in and sign-up run in the browser rather than in a server action because Supabase forwards the caller's address to Turnstile with the token: from a server action that would be the Worker's address, not the visitor's. Updating a guest's email needs no token (it is a request for an existing account), and Google sign-in is not covered by Supabase's captcha.

**Calendars need an account.** `canUseFeature("calendar")` in `lib/limits.ts` asks Supabase Auth for the user first and returns `{ ok: false, reason: "signin_required" }` for a guest (or no user), before the plan check and even while billing is off. The chat's `build_letter` tool emits it as a `limit` event, and the message invites the guest to create an account, saying that everything they made comes with them.

## Pieces

| Piece | Job |
|---|---|
| `middleware.ts`, `lib/supabase/middleware.ts` | Refresh the session; `isGuest()` and `routeAccess()` decide who may open which page |
| `components/auth/email-auth.ts` | `signInWithEmail`, `signUpWithEmail` (a guest's upgrade through `updateUser`) |
| `components/auth/turnstile.ts` | `useTurnstile()`: invisible widget, `getToken()`, `reset()` |
| `components/auth/sign-in-form.tsx`, `sign-up-form.tsx` | The forms: tokens, guest notes, refused-link messages, "Sign in with Google anyway" |
| `components/auth/auth-errors.ts` | Plain-language messages for Supabase error codes and callback codes |
| `components/auth/callback-url.ts` | `authCallbackUrl`, `signInErrorPath`, `safeAuthErrorCode` (all same-site, all checked) |
| `app/auth/actions.ts` | `signInWithGoogle(next, { switchAccount })`: `linkIdentity` for guests, `signInWithOAuth` otherwise; `signOut` |
| `app/auth/callback/route.ts` | Exchanges the code, or sends refused links and failed exchanges to `/signin?auth_error=...` |
| `components/app/tabs.ts`, `app-shell.tsx` | The four tabs and which one is active |
| `components/app/guest-notice.tsx`, `account-menu.tsx`, `session.ts` | The guest line, the guest account menu, `SessionUser.isGuest` |
| `app/(app)/dashboard/find/page.tsx`, `components/app/find-invite.tsx` | The Find a gift tab (an invitation until the finder is mounted) |
| `lib/limits.ts`, `lib/agents/events.ts` | The calendar gate and the `"signin_required"` limit reason |
| `app/(marketing)/privacy/page.tsx`, `terms/page.tsx` | Guest accounts, country and region, Turnstile, Apify, the finder's limits |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Public site key of the Turnstile widget "Majnu" (in `.env.production`); its secret lives only in Supabase |
| Supabase settings | Anonymous sign-ins, manual linking, captcha protection with the Turnstile secret, the "Change email address" template |

## Data and privacy

- A guest account is an `auth.users` row with `is_anonymous = true` and no email, name or password. Everything a guest makes is stored exactly as for a real user, under row-level security by `auth.uid()`, so upgrading moves nothing: the user id stays.
- The session lives in the same Supabase cookies as any sign-in, which the privacy page names as strictly necessary. If a guest clears their browser data or signs out, nobody can reach the guest account again.
- Turnstile sends the visitor's address and browser signals to Cloudflare; we receive a token, and Supabase verifies it. The privacy page links Cloudflare's Turnstile Privacy Addendum (<https://www.cloudflare.com/turnstile-privacy-policy/>), which invisible mode requires.
- Error codes in `/signin?auth_error=` are short snake_case strings; no message text, email or token travels in a URL.
- The privacy page and terms (updated 21 November 2026) also describe the finder's country and region, Apify and the finder's daily limits, which other sessions build.

## Limits and costs

- Turnstile is free. Supabase limits anonymous sign-ins to 30 an hour per IP address by default; Turnstile is the main guard against scripted guest accounts filling the database.
- Guests have the same spending guard as everyone (letters per day, chat turns per letter) plus the finder's own limits. Calendars are closed to guests.
- Supabase has no automatic clean-up of guest accounts; see open questions.

## How it was checked

- Unit tests: `tests/unit/lib/supabase/middleware.test.ts` (every route for signed-out, guest and real users, and `updateSession` redirects), `tests/unit/lib/limits.test.ts` (calendar gate for guests and real users, with billing off and on), `tests/unit/app/auth/next-redirects.test.ts` (Google linking for guests, switching accounts, refused links as data, callback errors), `tests/unit/components/auth/*` (email flows, error messages, callback URLs), `tests/unit/components/app/tabs.test.ts`.
- In an isolated Chrome at 375 and 1440 px: `/signin` and `/signup` show no Turnstile and no layout shift; the Turnstile script loads and the widget renders. That automated browser fails Cloudflare's challenge (error 600010), and the sign-in form then went ahead without a token: a real sign-in request with an unknown address reached Supabase from the browser and showed "That email and password don't match". The remaining console messages on those pages came from inside the Turnstile challenge (pages without it had none). `/signin?auth_error=identity_already_exists` shows the message and "Sign in with Google anyway". The app shell with a guest (through a temporary mock page, since deleted) shows the notice, four tabs and the guest menu, and is keyboard navigable; a real user's shell has no notice. Privacy and terms render without horizontal scrolling.
- With `curl`: `/dashboard/find`, `/dashboard` and `/create/...` redirect to `/signin` without a session; `/signin` and `/signup` answer 200; the callback turns `error_code=identity_already_exists` into `/signin?next=...&auth_error=identity_already_exists`.
- Live Supabase on 21 November: anonymous sign-ins were still **off** (`/auth/v1/settings` reports `anonymous_users: false`, and a test sign-in answered "Anonymous sign-ins are disabled"), so no guest was created and the upgrade flows (email confirmation, Google linking) are not yet checked end to end. Captcha protection was off (a password sign-in without a token was answered normally).

## Open questions

- **Owner settings in Supabase**: switch on anonymous sign-ins (Authentication → Sign In / Providers) and **Allow manual linking** (same page), which `linkIdentity` needs. Then enter the Turnstile secret under Authentication → Bot and Abuse Protection; from then on every email sign-in, sign-up and anonymous sign-in needs a token, which these forms and the finder send. The "Change email address" template is what a guest receives when upgrading with email; its default wording ("from {{ .Email }} to {{ .NewEmail }}") reads oddly with no old address, so give it a sign-up wording.
- **Merging two accounts** is not built. A guest who signs in to an existing account (with email, or with Google when that Google account already has a Majnu account) leaves the guest account and its gifts behind; the forms say so. A follow-up could move the guest's letters to the account they sign in to, on the server, after proving both sessions.
- **Clean-up of guest accounts**: Supabase does not delete anonymous users. A scheduled job could delete guest accounts older than 30 days that own no letters.
- **The chat's limit notice** (`components/create/chat-messages.tsx`) shows "See your plan" for any limit it does not know; for `"signin_required"` it should link to `/signup` instead.
- **After sign-in** people still land on `/dashboard` (Letters & invitations), set by `lib/billing/next-path.ts`. Once the finder is mounted in the Find a gift tab, `/dashboard/find` may be the better default.
- The terms state the finder's limits (3 searches a day, 2 personalised) as numbers; once `lib/finder` exports them, the terms should read them from there.
