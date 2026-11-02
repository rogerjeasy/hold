import { acceptedEvalRun, fieldRecord, inShop, withdrawnEvalRun } from '@hold/db'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { ScorecardScreen } from '@/features/scorecard/scorecard-screen'
import { scorecardRun } from '@/features/scorecard/scorecard-run'
import { getServices } from '@/server/services'
import { requireShop } from '@/server/shop-page'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('scorecard'))('title'), robots: { index: false, follow: false } }
}

export default async function Page() {
  const context = await requireShop()
  const { database } = await getServices()
  const { run, withdrawn, months } = await inShop(database, { role: 'hold_app', shopId: context.shop.id, userId: context.person.userId }, async (transaction) => ({ run: await acceptedEvalRun(transaction), withdrawn: await withdrawnEvalRun(transaction), months: await fieldRecord(transaction) }))
  return <ScorecardScreen shopName={context.shop.name} run={scorecardRun(run)} months={months} withdrawn={run === undefined ? withdrawn : undefined} />
}
