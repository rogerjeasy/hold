import { EMAIL_LIMITS } from '@hold/domain'
import { eq } from 'drizzle-orm'
import { rateTokensLeftIn, takeRateTokenIn } from './rate-limit.ts'
import type { RateLimit } from './rate-limit.ts'
import { shops } from './schema/index.ts'
import type { Transaction } from './scope.ts'

const DAY = 24 * 60 * 60
type Share = { readonly limit: RateLimit; readonly subject: string }
const share = (name: string, max: number, subject: string): Share => ({ limit: { name, max, windowSeconds: DAY }, subject })

// essential: mail a renter needs to act on their own money (emailIsEssential in packages/domain). network: where the
// request came from, as callerNetwork counts it, which bounds a demo's essential mail.
export type EmailTarget = { readonly shopId: string; readonly rentalId: string | null; readonly to: string; readonly essential: boolean; readonly network: string }

// The limits one email counts against (packages/domain EMAIL_LIMITS). Every email: its rental, its address in its shop,
// its shop. Then exactly one of three pools that never overlap: every demo's mail; real shops' essential mail, which no
// demo counts against; real shops' discretionary mail. A demo's essential mail also counts by network, all demo mail by
// address across demos, and all discretionary mail by address across every shop. A real shop's essential mail to its own
// renter counts against nothing another shop sends.
function sharesOf(target: EmailTarget, demo: boolean): Share[] {
  const each = [
    ...(target.rentalId === null ? [] : [share('email-rental', EMAIL_LIMITS.perRentalPerDay, target.rentalId)]),
    share('email-address-in-shop', EMAIL_LIMITS.perAddressPerShopPerDay, `${target.shopId}\u0000${target.to}`),
    share('email-shop', EMAIL_LIMITS.perShopPerDay, target.shopId),
  ]
  const discretionary = target.essential ? [] : [share('email-discretionary-address', EMAIL_LIMITS.discretionaryPerAddressPerDay, target.to)]
  if (demo) {
    return [
      ...each,
      ...discretionary,
      ...(target.essential ? [share('email-demo-essential-network', EMAIL_LIMITS.demoEssentialPerNetworkPerDay, target.network)] : []),
      share('email-demo-address', EMAIL_LIMITS.demoPerAddressPerDay, target.to),
      share('email-demo-day', EMAIL_LIMITS.demoPerDay, 'every demo'),
    ]
  }
  return target.essential
    ? [...each, share('email-shops-essential-day', EMAIL_LIMITS.shopsEssentialPerDay, 'every shop')]
    : [...each, ...discretionary, share('email-shops-discretionary-day', EMAIL_LIMITS.shopsDiscretionaryPerDay, 'every shop')]
}

// One more email someone asked Hold to send today (architecture.md section 15), within every limit that applies to it.
// All or nothing: every limit is read first and none is counted unless all have room, so a refused email spends
// nothing even where the caller's work commits after it. The limiter keeps only a digest of each subject, so no address
// is stored with it. A shop that cannot be read counts as a demo, the stricter.
export async function takeEmailAllowance(transaction: Transaction, target: EmailTarget): Promise<boolean> {
  const [shop] = await transaction.select({ demo: shops.demoSession }).from(shops).where(eq(shops.id, target.shopId))
  const shares = sharesOf(target, shop?.demo !== false)
  for (const each of shares) if ((await rateTokensLeftIn(transaction, each.limit, each.subject)) === 0) return false
  // Each had room a moment ago; one taken by a request in between still refuses, and leaves the rest as counted.
  let allowed = true
  for (const each of shares) allowed = (await takeRateTokenIn(transaction, each.limit, each.subject)) && allowed
  return allowed
}
