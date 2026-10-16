import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { ConditionScreen } from '@/features/renter/condition-screen'
import { LinkRefused } from '@/features/renter/link-refused'
import { conditionPage, renterPageMetadata } from '@/server/renter-page'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('renter.condition')
  return renterPageMetadata(t('title'))
}

// The condition report sent at handover. A rental not yet handed over has none, and reads as a link that cannot be used.
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const page = await conditionPage(token)
  if (!page.ok) return <LinkRefused failure={page.failure === 'not_handed_over' ? 'link_invalid' : page.failure} />
  return <ConditionScreen token={token} report={page.report} />
}
