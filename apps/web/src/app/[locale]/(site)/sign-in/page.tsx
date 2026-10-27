import { currentAttempt } from '@/features/auth/session-cookies'
import { SignInScreen } from '@/features/auth/sign-in-screen'
import { pageMetadata } from '@/features/marketing/page-metadata'
import { getServices } from '@/server/services'

export const generateMetadata = pageMetadata('signIn')

export default async function Page() {
  const attempt = await currentAttempt()
  const demo = (await (await getServices()).demoAccounts()) !== undefined
  return <SignInScreen codeSentTo={attempt?.page === 'signIn' ? attempt.email : undefined} demo={demo} />
}
