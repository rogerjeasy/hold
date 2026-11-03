import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { ConditionScreen } from '@/features/renter/condition-screen'
import { LinkRefused } from '@/features/renter/link-refused'
import { LinkUnavailable } from '@/features/renter/link-unavailable'
import { conditionPage, renterPageMetadata } from '@/server/renter-page'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('renter.condition')
  return renterPageMetadata(t('title'))
}

// The condition report sent at handover. A rental not yet handed over has none yet, and the page says so.
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const page = await conditionPage(token)
  if (!page.ok) return page.failure === 'not_handed_over' ? <LinkUnavailable token={token} reason="not_handed_over" /> : <LinkRefused failure={page.failure} />
  return <ConditionScreen token={token} report={page.report} />
}
