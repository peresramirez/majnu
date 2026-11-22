// Where someone lands after signing in, signing up or turning their guest
// account into a real one (issue #47): the gift finder, unless a same-site
// `next` says otherwise. Pure, so the browser forms, the server action's
// callback and the tests share it.
//
// `next` is checked with safeNextPath() (lib/billing/next-path.ts): only a path
// on this site, never another host, a scheme or a way back to a sign-in page.
import { APP_HOME } from "@/components/app/tabs"
import { safeNextPath } from "@/lib/billing/next-path"

export function afterAuthPath(next: unknown): string {
  return safeNextPath(next) ?? APP_HOME
}
