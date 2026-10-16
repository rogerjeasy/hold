import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { HoldReturnScreen } from '@/features/renter/hold-return-screen'
import { HoldScreen } from '@/features/renter/hold-screen'
import { LinkRefused } from '@/features/renter/link-refused'
import { renterHoldPage, renterPageMetadata } from '@/server/renter-page'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('renter.holdPage')
  return renterPageMetadata(t('title'))
}

// Where the renter approves the hold at pickup, from the code staff show. PayPal returns the renter here too, with its
// order as `token`: opening the page changes nothing, and the hold is confirmed by a POST.
export default async function Page({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ token?: string | string[] }> }) {
  const { token } = await params
  const orderId = (await searchParams).token
  const page = await renterHoldPage(token)
  if (!page.ok) return <LinkRefused failure={page.failure} />
  if (typeof orderId === 'string') return <HoldReturnScreen token={token} orderId={orderId} shopName={page.view.shopName} placed={page.hold?.state === 'placed'} />
  return <HoldScreen token={token} view={page.view} hold={page.hold} />
}
