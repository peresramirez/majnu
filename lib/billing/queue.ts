// Hands a paid purchase to the design job. The job takes about 90 seconds, too
// long for a request, so in production it runs in the Worker's queue consumer
// (worker.ts, the `majnu-designs` Cloudflare Queue). Sending the same purchase
// twice is harmless: the job claims a purchase with a conditional update
// (paid → designing), so only one run ever starts.
//
// Where there is no queue binding:
// * `next dev` runs the job in the background of the dev server (Node has no
//   time limit), so a test purchase on a laptop goes all the way through.
// * Anywhere else the purchase stays `paid` and the job is run by hand:
//   `node scripts/daytona/run-purchase.mts <purchaseId>`.
import "server-only"
import { getCloudflareContext } from "@opennextjs/cloudflare"

export const DESIGN_QUEUE_BINDING = "DESIGN_QUEUE"

export type DesignMessage = { purchaseId: string }

type QueueLike = { send(body: DesignMessage, options?: { contentType?: "json" }): Promise<unknown> }

export type EnqueueOutcome = "queued" | "inline" | "not_queued"

function designQueue(): QueueLike | null {
  try {
    const env = getCloudflareContext().env as Record<string, unknown>
    const queue = env[DESIGN_QUEUE_BINDING]
    return queue && typeof (queue as QueueLike).send === "function" ? (queue as QueueLike) : null
  } catch {
    // Not running on Workers (next dev, tests, scripts).
    return null
  }
}

export async function enqueueDesign(purchaseId: string): Promise<EnqueueOutcome> {
  const queue = designQueue()
  if (queue) {
    await queue.send({ purchaseId }, { contentType: "json" })
    return "queued"
  }
  if (process.env.NODE_ENV === "development") {
    // Loaded only here, so routes do not carry the job unless they run it.
    const { runPurchaseDesign } = await import("./fulfil")
    void runPurchaseDesign(purchaseId).catch((error: unknown) => {
      console.error("design job failed", purchaseId, error instanceof Error ? error.message : error)
    })
    return "inline"
  }
  console.warn("design queue not bound; purchase stays paid until it is run by hand", purchaseId)
  return "not_queued"
}
