import { findInvitation } from '@hold/db'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { InvitationScreen } from '@/features/auth/invitation-screen'
import { currentAttempt } from '@/features/auth/session-cookies'
import { getServices } from '@/server/services'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta.invite')
  // A link from an email is nobody's search result.
  return { title: t('title'), robots: { index: false, follow: false } }
}

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invitation = await findInvitation((await getServices()).database, token, new Date())
  const attempt = await currentAttempt()
  const codeSentTo = attempt?.page === 'invite' && attempt.invitation?.token === token ? attempt.email : undefined
  return <InvitationScreen token={token} invitation={invitation} codeSentTo={codeSentTo} />
}
