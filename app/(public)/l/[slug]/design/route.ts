// majnu.app/l/<slug>/design: the newest custom design of a letter, made in a
// Daytona sandbox (lib/daytona/redesign.ts). /l/<slug> shows it in an iframe.
//
// The HTML was influenced by the sender and is served from our domain, so it
// always goes out with the sandboxing headers in lib/daytona/designs.ts. Error
// responses are plain text and say nothing about the letter.
import { DESIGN_HEADERS, getLatestDesign } from "@/lib/daytona/designs"

export const dynamic = "force-dynamic"

type Context = { params: Promise<{ slug: string }> }

const SLUG = /^[A-Za-z0-9_-]{6,64}$/

const PLAIN_HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
  "Cache-Control": "no-store",
}

export async function GET(_request: Request, { params }: Context) {
  const { slug } = await params
  if (!SLUG.test(slug)) return new Response("Not found", { status: 404, headers: PLAIN_HEADERS })
  try {
    const design = await getLatestDesign(slug)
    if (!design) return new Response("Not found", { status: 404, headers: PLAIN_HEADERS })
    return new Response(design.html, { status: 200, headers: DESIGN_HEADERS })
  } catch (error) {
    console.error("Could not serve the design", error instanceof Error ? error.message : error)
    return new Response("Something went wrong", { status: 500, headers: PLAIN_HEADERS })
  }
}
