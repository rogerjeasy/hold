import { currentAttempt } from '@/features/auth/session-cookies'
import { SignUpScreen } from '@/features/auth/sign-up-screen'
import { pageMetadata } from '@/features/marketing/page-metadata'

export const generateMetadata = pageMetadata('signUp')

export default async function Page() {
  const attempt = await currentAttempt()
  return <SignUpScreen codeSentTo={attempt?.page === 'signUp' ? attempt.email : undefined} />
}
