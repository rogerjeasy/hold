'use server'
import { grantStandingRule, inShop, liveStandingRule, revokeMandate, saveDecisionPromiseDays, writeClaimMessage } from '@hold/db'
import { DECISION_PROMISE } from '@hold/domain'
import { renterMessageInput } from '@hold/mobile-api'
import { shopMessageEmail, shopMessageText } from '@hold/notify'
import { z } from 'zod'
import { Refusal, shopAction, withLocale } from '@/server/shop-access'
import { reachRenterIn } from '@/server/renter-reach'
import { getServices } from '@/server/services'

// The shop's promise to decide a contested claim, and staff's answers to the renter (architecture.md section 6.16).

const OWNER = ['owner'] as const
const WAIVER = 'decision_promise_missed'

// How many days the shop promises. Claims already presented keep the days they were shown.
export const savePromiseDays = shopAction({ name: 'shop.promise_days_saved', roles: OWNER, needsPasskey: false, input: withLocale({ days: z.coerce.number().int().min(DECISION_PROMISE.minDays).max(DECISION_PROMISE.maxDays) }) }, async (context, input, transaction) => {
  await saveDecisionPromiseDays(transaction, context.shop.id, input.days)
  return { days: input.days }
})

// The rule that waives a contested claim the shop did not decide in time. It only releases, so it may act for the
// owner; granting it needs a passkey, and granting it again replaces the live one.
export const grantPromiseWaiver = shopAction({ name: 'shop.promise_waiver_granted', roles: OWNER, needsPasskey: true, input: withLocale({ dailyCount: z.coerce.number().int().min(1).max(20), days: z.coerce.number().int().min(1).max(90) }) }, async (context, input, transaction) => {
  const now = new Date()
  const live = await liveStandingRule(transaction, now, WAIVER)
  if (live !== undefined) await revokeMandate(transaction, live.id, now)
  return { mandateId: await grantStandingRule(transaction, context.person.userId, { dailyCount: input.dailyCount, days: input.days }, now, WAIVER) }
})

// Turning it off is never held back by a missing passkey.
export const revokePromiseWaiver = shopAction({ name: 'shop.promise_waiver_revoked', roles: OWNER, needsPasskey: false, input: withLocale({}) }, async (_context, _input, transaction) => {
  const now = new Date()
  const live = await liveStandingRule(transaction, now, WAIVER)
  if (live === undefined) return new Refusal('standing_rule_off')
  await revokeMandate(transaction, live.id, now)
  return { mandateId: live.id }
})

// An answer to the renter, recorded on the claim and sent to them in the shop's words, by text or email as they chose
// (architecture.md section 12.3). A message that cannot go leaves the answer on the renter's claim page.
export const writeToRenter = shopAction(
  { name: 'claim.message_sent', roles: ['owner', 'manager', 'counter_staff'], needsPasskey: false, input: renterMessageInput, rateLimit: { name: 'claim-message-shop', max: 60, windowSeconds: 3600 } },
  async (context, input, transaction) => {
    const written = await writeClaimMessage(transaction, { rentalId: input.rentalId, author: 'shop', userId: context.person.userId, body: input.body }, new Date())
    return written.ok ? { rentalId: input.rentalId, body: input.body.trim() } : new Refusal(written.reason)
  },
  async (context, output) => {
    try {
      const { database } = await getServices()
      const facts = { shopName: context.shop.name, text: output.body }
      await inShop(database, { role: 'hold_app', shopId: context.shop.id }, (transaction) =>
        reachRenterIn(transaction, output.rentalId, (contact) => ({ purpose: 'shop_message', email: contact.email === null ? null : shopMessageEmail(contact.email, contact.language, facts), text: shopMessageText(facts) })))
    } catch {
      // The answer is on the claim page either way.
    }
  },
)
