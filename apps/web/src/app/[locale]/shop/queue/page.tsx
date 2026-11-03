import { dropOffsWaiting, inShop, liveStandingRule, morningQueue, proposalAmount, recentDecisions, rulesForOwner, sampleEntriesToInvestigate, sampleInvestigation } from '@hold/db'
import type { Transaction } from '@hold/db'
import { shopDay } from '@hold/domain'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { QueueScreen } from '@/features/operations/queue-screen'
import { dropOffEntries } from '@/server/drop-offs'
import { passkeyGate } from '@/server/passkey-gate'
import { getServices } from '@/server/services'
import { requireShop } from '@/server/shop-page'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('operations'))('title'), robots: { index: false, follow: false } }
}

// Each drafted rule with the amount of the proposal it came from, read now from the records, to start the owner's
// "below an amount" from.
async function rulesWithAmounts(transaction: Transaction) {
  const rules = []
  for (const rule of await rulesForOwner(transaction)) {
    const suggested = rule.state === 'drafted' && rule.fromProposalId !== null ? await proposalAmount(transaction, rule.fromProposalId) : undefined
    rules.push({ id: rule.id, rule: rule.rule, state: rule.state, suggestedCents: suggested?.amountCents ?? null })
  }
  return rules
}

// The morning queue (extensions.md section 6.3): every staff member reads it; owners and managers decide.
export default async function Page() {
  const context = await requireShop()
  const { database } = await getServices()
  const now = new Date()
  const loaded = await inShop(database, { role: 'hold_app', shopId: context.shop.id, userId: context.person.userId }, async (transaction) => ({
    entries: await morningQueue(transaction, now),
    recent: await recentDecisions(transaction, now),
    rules: await rulesWithAmounts(transaction),
    standingRule: await liveStandingRule(transaction, now),
    dropOffs: await dropOffsWaiting(transaction),
    // A demo's sample entries no model has looked at yet, and how the last investigation of them stands (section 6.14).
    samples: { waiting: (await sampleEntriesToInvestigate(transaction)).length, status: await sampleInvestigation(transaction, now) },
  }))
  return (
    <QueueScreen
      shopName={context.shop.name}
      clock={{ timeZone: context.shop.timeZone, currency: context.shop.currency }}
      endOfDay={shopDay(context.shop.timeZone, now).end}
      {...loaded}
      dropOffs={await dropOffEntries(loaded.dropOffs)}
      canCheck={context.role !== 'read_only'}
      canDecide={context.role === 'owner' || context.role === 'manager'}
      isOwner={context.role === 'owner'}
      gate={await passkeyGate(context)}
    />
  )
}
