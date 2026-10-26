import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { LinkRefused } from '@/features/renter/link-refused'
import { CleanRecordScreen } from '@/features/trust/clean-record-screen'
import { cleanRecordPage } from '@/server/clean-record'
import { renterPageMetadata } from '@/server/renter-page'

export async function generateMetadata(): Promise<Metadata> {
  return renterPageMetadata((await getTranslations('trust.record'))('title'))
}

// The renter's Clean Record. Each visit signs a fresh credential; nothing else changes on arrival.
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const page = await cleanRecordPage(token, await getLocale())
  return page.ok ? <CleanRecordScreen token={token} view={page.view} /> : <LinkRefused failure={page.failure} />
}
