import { decisionRecords, inShop } from '@hold/db'
import { shopDay } from '@hold/domain'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { boardRows } from '@/features/decisions/board'
import { DecisionsScreen } from '@/features/decisions/decisions-screen'
import { passkeyGate } from '@/server/passkey-gate'
import { getServices } from '@/server/services'
import { requireShop } from '@/server/shop-page'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('decisions'))('title'), robots: { index: false, follow: false } }
}

// The decision board (extensions.md section 12.5): every staff member reads it, and each row says who decides it. The
// records are read inside the shop alone; the photographs of the claims shown get links that work for a few minutes.
export default async function Page() {
  const context = await requireShop()
  const { database, evidence } = await getServices()
  const now = new Date()
  const records = await inShop(database, { role: 'hold_app', shopId: context.shop.id, userId: context.person.userId }, (transaction) => decisionRecords(transaction, now))
  const rows = boardRows(records, { userId: context.person.userId, role: context.role, approvalLimitCents: context.approvalLimitCents }, now)
  const keys = [...new Set(records.claims.flatMap((claim) => claim.lines.flatMap((line) => [line.beforeKey, line.afterKey])).filter((key): key is string => key !== null))]
  const photoUrls: Readonly<Record<string, string>> = evidence === undefined ? {} : Object.fromEntries(await Promise.all(keys.map(async (key) => [key, await evidence.displayLink(key)] as const)))
  return (
    <DecisionsScreen
      shopName={context.shop.name}
      clock={{ timeZone: context.shop.timeZone, currency: context.shop.currency }}
      endOfDay={shopDay(context.shop.timeZone, now).end}
      rows={rows}
      photoUrls={photoUrls}
      gate={await passkeyGate(context)}
    />
  )
}
