// Redeeming a coupon code for a personalised wrapper (docs/features/coupons.md).
//
// A valid code takes the place of Stripe: no Checkout, no card, and no account
// step for guests. Everything else is as for a paid wrapper:
// * the letter must be the sender's own built letter (read through row-level
//   security), and the design request is cleaned as for Checkout;
// * redeem_coupon() (supabase/migrations/0011_coupons.sql) takes one use and
//   records the purchase as paid, with amount 0 and the coupon, in one
//   transaction, so two people can never take the last use;
// * the purchase then goes to the design queue (enqueueDesign), exactly like
//   one Stripe confirmed. A failed run gives the use back instead of a refund
//   (returnCouponUse in ./purchases.ts, called from ./refunds.ts).
// Nothing here calls Stripe.
import "server-only"
import { WRAPPER_REQUEST_MAX_CHARS } from "@/lib/plans"
import { createAdminClient } from "@/lib/supabase/admin"
import { normaliseCouponCode, hashCouponCode } from "./coupon-code"
import { getMyLetterForWrapper } from "./my-purchases"
import { getPurchase, returnCouponUse, type Purchase } from "./purchases"
import { enqueueDesign } from "./queue"
import { cleanWrapperRequest, type BillingUser } from "./service"

export type CouponInput = { letterId: unknown; request: unknown; coupon: unknown }

export type CouponRefusal =
  | "invalid_request"
  | "letter_not_found"
  | "not_a_letter"
  | "not_built"
  | "in_progress"
  | "code_invalid"
  | "code_used_up"
  | "code_expired"
  | "code_already_used"

export type CouponRedemption =
  | { kind: "redeemed"; purchase: Purchase; letter: { slug: string; title: string | null } }
  | { kind: "refused"; reason: CouponRefusal; message: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The same answers as Checkout for the letter; one each for the code. An
// unknown code and a disabled one get the same words, so nobody learns which
// codes exist.
const REFUSALS: Record<CouponRefusal, string> = {
  invalid_request: `Describe the look you want in a few words (at most ${WRAPPER_REQUEST_MAX_CHARS} characters).`,
  letter_not_found: "We couldn't find that gift.",
  not_a_letter: "Personalised wrappers are for letters and gifts. A calendar keeps its own design.",
  not_built: "Wrap the gift first, then make it unique.",
  in_progress: "A design for this gift is already being made. It shows on the gift page as soon as it is ready.",
  code_invalid: "That code doesn't work. Check it and try again.",
  code_used_up: "That code has been used as many times as it can be.",
  code_expired: "That code has expired.",
  code_already_used: "You have already used this code. Each person can use it once.",
}

function refused(reason: CouponRefusal): CouponRedemption {
  return { kind: "refused", reason, message: REFUSALS[reason] }
}

type RedeemRow = { outcome: string; purchase_id: string | null }

const OUTCOMES: Record<string, CouponRefusal> = {
  invalid: "code_invalid",
  used_up: "code_used_up",
  expired: "code_expired",
  already_redeemed: "code_already_used",
  in_progress: "in_progress",
  letter_not_found: "letter_not_found",
}

// Guests may redeem a code: a code needs no receipt, so no email either.
export async function redeemWrapperCoupon(user: Pick<BillingUser, "id">, input: CouponInput): Promise<CouponRedemption> {
  const request = cleanWrapperRequest(input.request)
  if (!request) return refused("invalid_request")
  if (typeof input.letterId !== "string" || !UUID.test(input.letterId)) return refused("letter_not_found")
  // Something that cannot be a code is answered without asking the database.
  const code = normaliseCouponCode(input.coupon)
  if (!code) return refused("code_invalid")

  const letter = await getMyLetterForWrapper(input.letterId)
  if (!letter) return refused("letter_not_found")
  // A calendar baked into one static page would carry its locked doors.
  if (letter.kind !== "letter") return refused("not_a_letter")
  if (!letter.built) return refused("not_built")

  const { data, error } = await createAdminClient()
    .rpc("redeem_coupon", {
      p_code_hash: await hashCouponCode(code),
      p_owner_id: user.id,
      p_letter_id: letter.id,
      p_request: request,
    })
    .single<RedeemRow>()
  if (error) throw new Error(`Could not redeem the code: ${error.message}`)
  if (data.outcome !== "redeemed" || !data.purchase_id) return refused(OUTCOMES[data.outcome] ?? "code_invalid")

  const purchaseId = data.purchase_id
  let purchase: Purchase | null
  try {
    purchase = await getPurchase(purchaseId)
    if (!purchase) throw new Error("The redeemed purchase could not be read back")
    // As for a paid purchase: the queue in production, the dev server's
    // background in `next dev`. A duplicate hand-over is harmless.
    await enqueueDesign(purchaseId)
  } catch (error) {
    // The design cannot start, so the code is given back rather than spent on
    // a purchase that would wait for ever and block the letter.
    await returnCouponUse(purchaseId, `Could not start the design: ${error instanceof Error ? error.message : String(error)}`)
    throw error
  }
  return { kind: "redeemed", purchase, letter: { slug: letter.slug, title: null } }
}
