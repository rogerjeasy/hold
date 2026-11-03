import { EMAIL_LIMITS } from '@hold/domain'
import { eq } from 'drizzle-orm'
import { rateTokensLeftIn, takeRateTokenIn } from './rate-limit.ts'
import type { RateLimit } from './rate-limit.ts'
import { shops } from './schema/index.ts'
import type { Transaction } from './scope.ts'

const DAY = 24 * 60 * 60
const limit = (name: string, max: number): RateLimit => ({ name, max, windowSeconds: DAY })

// essential: mail a renter needs to act on their own money (emailIsEssential in packages/domain). network: where the
// request came from, which bounds a demo's essential mail.
export type EmailTarget = { readonly shopId: string; readonly rentalId: string | null; readonly to: string; readonly essential: boolean; readonly network: string }

// One more email someone asked Hold to send today (architecture.md section 15), within every limit that applies to it
// (packages/domain EMAIL_LIMITS). No limit another tenant can spend ever applies to essential mail, and a demo shop's
// mail never counts against a real shop's day. All or nothing: every limit is read first and none is counted unless all
// have room, so a refused email spends nothing even where the caller's work commits after it. The limiter keeps only a
// digest of each subject, so no address is stored with it.
export async function takeEmailAllowance(transaction: Transaction, target: EmailTarget): Promise<boolean> {
  const [shop] = await transaction.select({ demo: shops.demoSession }).from(shops).where(eq(shops.id, target.shopId))
  const demo = shop?.demo !== false
  const shares: { readonly limit: RateLimit; readonly subject: string }[] = [
    ...(target.rentalId === null ? [] : [{ limit: limit('email-rental', EMAIL_LIMITS.perRentalPerDay), subject: target.rentalId }]),
    { limit: limit('email-address-in-shop', EMAIL_LIMITS.perAddressPerShopPerDay), subject: `${target.shopId}\u0000${target.to}` },
    { limit: limit('email-shop', EMAIL_LIMITS.perShopPerDay), subject: target.shopId },
    ...(target.essential
      ? demo ? [{ limit: limit('email-demo-essential-network', EMAIL_LIMITS.demoEssentialPerNetworkPerDay), subject: target.network }] : []
      : [demo ? { limit: limit('email-demo-discretionary', EMAIL_LIMITS.demoDiscretionaryPerDay), subject: 'every demo' } : { limit: limit('email-shops-discretionary', EMAIL_LIMITS.shopsDiscretionaryPerDay), subject: 'every shop' }]),
  ]
  for (const share of shares) if ((await rateTokensLeftIn(transaction, share.limit, share.subject)) === 0) return false
  // Each had room a moment ago; one taken by a request in between still refuses, and leaves the rest as counted.
  let allowed = true
  for (const share of shares) allowed = (await takeRateTokenIn(transaction, share.limit, share.subject)) && allowed
  return allowed
}
