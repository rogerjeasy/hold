import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { AssistantScreen } from '@/features/assistant/assistant-screen'
import { LinkRefused } from '@/features/renter/link-refused'
import { LinkUnavailable } from '@/features/renter/link-unavailable'
import { assistantPage } from '@/server/assistant-page'
import { renterPageMetadata } from '@/server/renter-page'

export async function generateMetadata(): Promise<Metadata> {
  return renterPageMetadata((await getTranslations('renter.assistant'))('pageTitle'))
}

// What the renter's own assistant did on the rental, and disconnecting it. Visiting changes nothing.
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const page = await assistantPage(token)
  if (page.ok) return <AssistantScreen token={token} view={page.view} />
  // A working link to a rental no assistant booked says so, and leads back to the rental.
  return page.failure === 'not_found' ? <LinkUnavailable token={token} reason="no_assistant" /> : <LinkRefused failure={page.failure} />
}
