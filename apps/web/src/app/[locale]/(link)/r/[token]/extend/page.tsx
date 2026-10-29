import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { RenterExtendScreen } from '@/features/extension/renter-extend-screen'
import { LinkRefused } from '@/features/renter/link-refused'
import { extensionPage } from '@/server/extension-page'
import { renterPageMetadata } from '@/server/renter-page'

export async function generateMetadata(): Promise<Metadata> {
  return renterPageMetadata((await getTranslations('extension'))('title'))
}

// Keeping the item longer from the renter's phone (architecture.md section 6.14).
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const page = await extensionPage(token)
  return page.ok ? <RenterExtendScreen token={token} data={page.data} /> : <LinkRefused failure={page.failure} />
}
