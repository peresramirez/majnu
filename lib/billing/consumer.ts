// The queue consumer that makes personalised wrappers, as worker.ts hands it
// each batch. Kept out of worker.ts, whose only export is the Worker's default
// handler, so it can be unit-tested.
//
// Two queues (wrangler.jsonc; scripts/deploy.sh creates them if missing):
// * majnu-designs: { purchaseId } for each paid purchase. max_retries is 0,
//   because a retry is another paid run; the job refunds every failure it can
//   see itself and acknowledges the message.
// * majnu-designs-dlq: where a message lands if the consumer could not finish
//   it (it threw, or the invocation died). Its consumer refunds the purchase,
//   which is then still paid or designing.
import "server-only"
import { refundAbandonedPurchase, runPurchaseDesign, type JobOutcome } from "./fulfil"

export const DESIGN_QUEUE = "majnu-designs"
export const DESIGN_DEAD_LETTER_QUEUE = "majnu-designs-dlq"

// The parts of the Workers runtime's queue types this consumer uses. The app's
// tsconfig compiles against the DOM library for Next.js, which conflicts with
// the Workers runtime types, so those are not installed.
export type QueueMessage = { readonly id: string; readonly body: unknown; readonly attempts: number; ack(): void; retry(): void }
export type MessageBatch = { readonly queue: string; readonly messages: readonly QueueMessage[] }

type Jobs = {
  run: (purchaseId: string) => Promise<JobOutcome>
  refund: (purchaseId: string) => Promise<JobOutcome>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function purchaseIdOf(body: unknown): string | null {
  if (!body || typeof body !== "object") return null
  const id = (body as { purchaseId?: unknown }).purchaseId
  return typeof id === "string" && UUID.test(id) ? id : null
}

export async function consumeDesignBatch(
  batch: MessageBatch,
  jobs: Jobs = { run: (id) => runPurchaseDesign(id), refund: (id) => refundAbandonedPurchase(id) },
): Promise<void> {
  const deadLetters = batch.queue === DESIGN_DEAD_LETTER_QUEUE
  for (const message of batch.messages) {
    const purchaseId = purchaseIdOf(message.body)
    if (!purchaseId) {
      console.error(JSON.stringify({ event: "design_job_bad_message", queue: batch.queue, messageId: message.id }))
      message.ack()
      continue
    }
    try {
      const result = deadLetters ? await jobs.refund(purchaseId) : await jobs.run(purchaseId)
      console.log(JSON.stringify({ event: "design_job", queue: batch.queue, purchaseId, ...result }))
      message.ack()
    } catch (error) {
      // Only a failure to reach the database or Stripe gets here. With
      // max_retries 0 the message moves to the dead-letter queue, whose
      // consumer refunds the purchase.
      console.error(
        JSON.stringify({ event: "design_job_error", queue: batch.queue, purchaseId, error: error instanceof Error ? error.message : String(error) }),
      )
      message.retry()
    }
  }
}
