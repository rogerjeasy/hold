import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { AssistantScreen } from '@/features/assistant/assistant-screen'
import { LinkRefused } from '@/features/renter/link-refused'
import { assistantPage } from '@/server/assistant-page'
import { renterPageMetadata } from '@/server/renter-page'

export async function generateMetadata(): Promise<Metadata> {
  return renterPageMetadata((await getTranslations('renter.assistant'))('pageTitle'))
}

// What the renter's own assistant did on the rental, and disconnecting it. Visiting changes nothing.
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const page = await assistantPage(token)
  return page.ok ? <AssistantScreen token={token} view={page.view} /> : <LinkRefused failure={page.failure} />
}
