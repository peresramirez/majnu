// The design job for one paid purchase, as the queue consumer (worker.ts), the
// dev server and scripts/daytona/run-purchase.mts run it:
//
//   1. Claim the purchase: paid → designing, a conditional update, so a
//      duplicate message (or two consumers) never starts a second paid run.
//   2. Run the redesign (lib/daytona/redesign.ts), which stores the page in
//      letter_designs and returns its id.
//   3. Mark the purchase done with the design, or, if anything failed, refund
//      the payment through Stripe and mark it refunded. A purchase paid with
//      a coupon code is marked failed and its code gets the use back instead;
//      Stripe is never called for it (./refunds.ts, giveBack).
import "server-only"
import { redesignLetter, type RedesignResult } from "@/lib/daytona/redesign"
import { claimForDesign, getPurchase, markDone } from "./purchases"
import { giveBack } from "./refunds"

export type JobOutcome =
  | { outcome: "done"; designId: string; seconds: number }
  | { outcome: "refunded" | "refund_failed"; reason: string }
  // A coupon purchase: failed, and its code has the use back.
  | { outcome: "code_returned"; reason: string }
  | { outcome: "skipped"; reason: string }

export type JobDeps = {
  redesign: (letterId: string, request: string) => Promise<Pick<RedesignResult, "designId" | "seconds">>
  log: (line: string) => void
}

const defaultDeps: JobDeps = {
  redesign: (letterId, request) => redesignLetter(letterId, request),
  log: (line) => console.log(`[design job] ${line}`),
}

export async function runPurchaseDesign(purchaseId: string, deps: Partial<JobDeps> = {}): Promise<JobOutcome> {
  const { redesign, log } = { ...defaultDeps, ...deps }
  const purchase = await claimForDesign(purchaseId)
  if (!purchase) {
    const current = await getPurchase(purchaseId)
    const reason = current ? `the purchase is ${current.status}, not paid` : "no such purchase"
    log(`${purchaseId}: skipped, ${reason}`)
    return { outcome: "skipped", reason }
  }

  log(`${purchase.id}: designing`)
  try {
    if (!purchase.letterId) throw new Error("The gift was deleted before its design was made")
    const result = await redesign(purchase.letterId, purchase.request)
    await markDone(purchase.id, result.designId)
    log(`${purchase.id}: done, design ${result.designId} in ${result.seconds} s`)
    return { outcome: "done", designId: result.designId, seconds: result.seconds }
  } catch (error) {
    // RedesignError messages are already redacted (lib/daytona/redesign.ts).
    const reason = `The design run failed: ${error instanceof Error ? error.message : String(error)}`
    log(`${purchase.id}: ${reason}`)
    return refundAfterFailure(purchase, reason, log)
  }
}

// For a message the queue gave up on (the dead-letter queue): the consumer
// died mid-run, so the purchase is still paid or designing. Refund it.
export async function refundAbandonedPurchase(purchaseId: string, deps: Partial<Pick<JobDeps, "log">> = {}): Promise<JobOutcome> {
  const log = deps.log ?? defaultDeps.log
  const purchase = await getPurchase(purchaseId)
  if (!purchase || (purchase.status !== "paid" && purchase.status !== "designing")) {
    return { outcome: "skipped", reason: purchase ? `the purchase is ${purchase.status}` : "no such purchase" }
  }
  return refundAfterFailure(purchase, "The design run stopped before it finished", log)
}

async function refundAfterFailure(
  purchase: { id: string; paymentIntentId: string | null; couponId: string | null },
  reason: string,
  log: (line: string) => void,
): Promise<JobOutcome> {
  const refund = await giveBack(purchase, reason)
  if (refund.outcome === "code_returned") {
    log(`${purchase.id}: failed, the coupon code has its use back`)
    return { outcome: "code_returned", reason }
  }
  if (refund.outcome === "nothing_to_return") {
    // Someone else (the dead-letter queue, or the job itself) got there first.
    return { outcome: "skipped", reason: "the coupon purchase was already settled" }
  }
  if (refund.outcome === "refunded") {
    log(`${purchase.id}: refunded (${refund.refundId})`)
    return { outcome: "refunded", reason }
  }
  log(`${purchase.id}: REFUND FAILED, refund by hand: ${refund.reason}`)
  return { outcome: "refund_failed", reason: refund.reason }
}
