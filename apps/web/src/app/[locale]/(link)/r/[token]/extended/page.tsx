import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { ExtendedScreen } from '@/features/extension/extended-screen'
import { LinkRefused } from '@/features/renter/link-refused'
import { extensionPage } from '@/server/extension-page'
import { renterPageMetadata } from '@/server/renter-page'

export async function generateMetadata(): Promise<Metadata> {
  return renterPageMetadata((await getTranslations('extension.extended'))('title'))
}

// PayPal returns the renter here with its order as `token`. Opening the page changes nothing; it confirms by a POST.
export default async function Page({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ token?: string | string[] }> }) {
  const { token } = await params
  const orderId = (await searchParams).token
  const page = await extensionPage(token)
  if (!page.ok) return <LinkRefused failure={page.failure} />
  if (typeof orderId !== 'string') return <LinkRefused failure="link_invalid" />
  return <ExtendedScreen token={token} orderId={orderId} shopName={page.data.shopName} paid={page.data.extensions.some((each) => each.orderId === orderId && each.state === 'paid')} />
}
