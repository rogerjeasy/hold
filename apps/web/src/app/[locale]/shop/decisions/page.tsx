import { decisionRecords, inShop } from '@hold/db'
import { shopDay } from '@hold/domain'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { GridLicence } from '@/components/grid/grid-licence'
import type { ContestView } from '@/features/contest/contest-summary-panel'
import { boardRows } from '@/features/decisions/board'
import { DecisionsScreen } from '@/features/decisions/decisions-screen'
import { contestViewFor } from '@/server/contest-view'
import { passkeyGate } from '@/server/passkey-gate'
import { getServices } from '@/server/services'
import { requireShop } from '@/server/shop-page'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('decisions'))('title'), robots: { index: false, follow: false } }
}

// The decision board (extensions.md section 12.5): every staff member reads it, and each row says who decides it. The
// records are read inside the shop alone, with the neutral summary of each contest; the photographs of the claims and
// the drop-offs shown get links that work for a few minutes.
export default async function Page() {
  const context = await requireShop()
  const { config, database, evidence } = await getServices()
  const now = new Date()
  const { records, contests } = await inShop(database, { role: 'hold_app', shopId: context.shop.id, userId: context.person.userId }, async (transaction) => {
    const read = await decisionRecords(transaction, now)
    const views: Record<string, ContestView> = {}
    for (const claim of read.claims) {
      const view = claim.state === 'awaiting_approval' ? undefined : await contestViewFor(transaction, claim.rentalId, 'shop')
      if (view !== undefined) views[claim.claimId] = view
    }
    return { records: read, contests: views }
  })
  const rows = boardRows(records, { userId: context.person.userId, role: context.role, approvalLimitCents: context.approvalLimitCents }, now, contests)
  const keys = [...new Set([
    ...records.claims.flatMap((claim) => claim.lines.flatMap((line) => [line.beforeKey, line.afterKey])),
    ...records.dropOffs.flatMap((dropOff) => dropOff.items.flatMap((item) => [item.before?.displayKey, item.after?.displayKey, item.dropPoint?.displayKey])),
  ].filter((key): key is string => typeof key === 'string'))]
  const photoUrls: Readonly<Record<string, string>> = evidence === undefined ? {} : Object.fromEntries(await Promise.all(keys.map(async (key) => [key, await evidence.displayLink(key)] as const)))
  return (
    <>
      <GridLicence licenceKey={config.gridLicenceKey} />
      <DecisionsScreen
        shopName={context.shop.name}
        clock={{ timeZone: context.shop.timeZone, currency: context.shop.currency }}
        endOfDay={shopDay(context.shop.timeZone, now).end}
        rows={rows}
        photoUrls={photoUrls}
        gate={await passkeyGate(context)}
      />
    </>
  )
}
