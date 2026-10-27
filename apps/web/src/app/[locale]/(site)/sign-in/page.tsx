import { currentAttempt, readDemoSession } from '@/features/auth/session-cookies'
import { SignInScreen } from '@/features/auth/sign-in-screen'
import { pageMetadata } from '@/features/marketing/page-metadata'
import { getServices } from '@/server/services'

export const generateMetadata = pageMetadata('signIn')

export default async function Page() {
  const attempt = await currentAttempt()
  const demoOn = (await getServices()).demoSessions !== undefined
  const demo = demoOn ? ((await readDemoSession()) === undefined ? 'new' : 'current') : undefined
  return <SignInScreen codeSentTo={attempt?.page === 'signIn' ? attempt.email : undefined} demo={demo} />
}
