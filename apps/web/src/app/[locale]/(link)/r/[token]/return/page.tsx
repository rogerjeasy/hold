import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { LinkRefused } from '@/features/renter/link-refused'
import { RenterReturnScreen } from '@/features/self-return/renter-return-screen'
import { renterPageMetadata } from '@/server/renter-page'
import { selfReturnPage } from '@/server/self-return-page'

export async function generateMetadata(): Promise<Metadata> {
  return renterPageMetadata((await getTranslations('selfReturn.renter'))('title'))
}

// Returning the item with nobody at the counter, and the receipt once sent (architecture.md section 6.13).
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const page = await selfReturnPage(token)
  return page.ok ? <RenterReturnScreen token={token} data={page.data} /> : <LinkRefused failure={page.failure} />
}
