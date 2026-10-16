import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { LinkRefused } from '@/features/renter/link-refused'
import { PaidScreen } from '@/features/renter/paid-screen'
import { renterPage, renterPageMetadata } from '@/server/renter-page'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('renter.paid')
  return renterPageMetadata(t('title'))
}

// PayPal returns the renter here with its order as `token`. Opening the page changes nothing; it confirms by a POST.
export default async function Page({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ token?: string | string[] }> }) {
  const { token } = await params
  const orderId = (await searchParams).token
  const page = await renterPage(token)
  if (!page.ok) return <LinkRefused failure={page.failure} />
  if (typeof orderId !== 'string') return <LinkRefused failure="link_invalid" />
  return <PaidScreen token={token} orderId={orderId} shopName={page.view.shopName} booked={page.view.state !== 'pending_payment'} />
}
