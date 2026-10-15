import type { FakeIdentity } from '@hold/auth'
import { writeSession } from '@/features/auth/session-cookies'
import { getServices, TEST_SIGN_IN_CODE } from '@/server/services'

// For tests of server functions: a form as the browser sends it, and a person signed in through the fake identity
// with their session kept in the test's cookie jar. Each test file mocks next/headers onto that jar itself.

export function form(fields: Record<string, string | readonly string[]>): FormData {
  const data = new FormData()
  for (const [name, value] of Object.entries(fields)) {
    for (const each of typeof value === 'string' ? [value] : value) data.append(name, each)
  }
  return data
}

export async function signIn(jar: Map<string, string>, email: string, factor: 'email_code' | 'passkey'): Promise<string> {
  const { identity } = await getServices()
  const fake = identity as FakeIdentity
  if ((await fake.startSignIn(email)).ok && fake.lastCodeFor(email) === undefined) {
    await fake.signUp(email)
    await fake.confirmSignUp(email, TEST_SIGN_IN_CODE, undefined)
  }
  const started = await fake.startSignIn(email)
  if (!started.ok) throw new Error('No sign-in.')
  const tokens = await fake.answerSignInCode(email, TEST_SIGN_IN_CODE, started.value)
  if (!tokens.ok) throw new Error('No tokens.')
  jar.clear()
  await writeSession(tokens.value, factor)
  const verified = await fake.verifyAccessToken(tokens.value.accessToken)
  if (!verified.ok) throw new Error('No subject.')
  return verified.value.subject
}
