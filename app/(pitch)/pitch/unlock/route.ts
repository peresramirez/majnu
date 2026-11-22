// POST /pitch/unlock: checks the pitch deck's password (lib/pitch/gate.ts) and,
// when it is right, sets the cookie that lets /pitch render the deck.
//
// A plain form post gets a 303 back to /pitch (with ?wrong=1 when the password
// is wrong), so the gate works without JavaScript. The password screen sends
// `Accept: application/json` and gets { ok } with 200 or 401 instead.
import { NextResponse } from "next/server"
import { PITCH_COOKIE, PITCH_COOKIE_OPTIONS, passwordMatches, pitchCookieValue } from "@/lib/pitch/gate"

export const dynamic = "force-dynamic"

const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" }

async function submittedPassword(request: Request): Promise<unknown> {
  try {
    const type = request.headers.get("content-type") ?? ""
    if (type.includes("application/json")) {
      const body: unknown = await request.json()
      return body && typeof body === "object" ? (body as Record<string, unknown>).password : undefined
    }
    return (await request.formData()).get("password")
  } catch {
    return undefined
  }
}

function seeOther(location: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { ...HEADERS, Location: location } })
}

export async function POST(request: Request) {
  const wantsJson = (request.headers.get("accept") ?? "").includes("application/json")
  const ok = await passwordMatches(await submittedPassword(request))

  if (!ok) {
    return wantsJson ? NextResponse.json({ ok: false }, { status: 401, headers: HEADERS }) : seeOther("/pitch?wrong=1")
  }

  const response = wantsJson ? NextResponse.json({ ok: true }, { headers: HEADERS }) : seeOther("/pitch")
  response.cookies.set(PITCH_COOKIE, await pitchCookieValue(), PITCH_COOKIE_OPTIONS)
  return response
}
