import { currentAttempt } from '@/features/auth/session-cookies'
import { SignInScreen } from '@/features/auth/sign-in-screen'
import { pageMetadata } from '@/features/marketing/page-metadata'

export const generateMetadata = pageMetadata('signIn')

export default async function Page() {
  const attempt = await currentAttempt()
  return <SignInScreen codeSentTo={attempt?.page === 'signIn' ? attempt.email : undefined} />
}
