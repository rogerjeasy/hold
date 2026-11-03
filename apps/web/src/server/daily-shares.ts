import 'server-only'
import { rateTokensLeft, takeRateTokenIn } from '@hold/db'
import type { RateLimit, Transaction } from '@hold/db'
import { getServices } from './services'

// One share of a day's sample runs on Claude (architecture.md section 20.3): the limit, the subject it counts, which
// carries the UTC day so every share starts again at midnight UTC, the share's name for the log, and the refusal that
// names it on screen.
export type DailyShare<Reason extends string> = { readonly share: string; readonly limit: RateLimit; readonly subject: string; readonly refusal: Reason }

export type DailyAllowance<Reason extends string> = { readonly left: number; readonly refusal: Reason | null }

// How many runs the shares still allow today, and the refusal a run would get now from the first share with none
// left, read without taking any, so a page says it before anyone asks and again after a reload.
export async function dailyAllowance<Reason extends string>(shares: readonly DailyShare<Reason>[]): Promise<DailyAllowance<Reason>> {
  const { database } = await getServices()
  const left = await Promise.all(shares.map((each) => rateTokensLeft(database, each.limit, each.subject)))
  return { left: Math.min(...left), refusal: shares.find((_, index) => left[index] === 0)?.refusal ?? null }
}

// Takes each share in order in the caller's transaction, so a refused or failed run rolls back and spends nothing.
// Returns the share that refused, logged so an operator can see a judge refused: the shop is named, never the network.
export async function takeDailyShares<Reason extends string>(transaction: Transaction, shares: readonly DailyShare<Reason>[], log: { readonly event: string; readonly shopId: string }): Promise<DailyShare<Reason> | null> {
  for (const each of shares) {
    if (await takeRateTokenIn(transaction, each.limit, each.subject)) continue
    console.info(JSON.stringify({ event: log.event, share: each.share, shopId: log.shopId }))
    return each
  }
  return null
}
