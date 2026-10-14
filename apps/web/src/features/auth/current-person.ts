import 'server-only'
import { findPerson } from '@hold/db'
import type { Person } from '@hold/db'
import { getServices } from '@/server/services'
import { readAccessToken } from './session-cookies'

export type SignedIn =
  | { readonly signedIn: false }
  // A person can hold an account and no shop: a sign-up whose shop could not be created, or staff not yet invited.
  | { readonly signedIn: true; readonly subject: string; readonly person: Person | undefined }

// Who is making this request, from the access token, checked on the server each time.
export async function currentPerson(): Promise<SignedIn> {
  const accessToken = await readAccessToken()
  if (accessToken === undefined) return { signedIn: false }
  const { identity, database } = await getServices()
  const verified = await identity.verifyAccessToken(accessToken)
  if (!verified.ok) return { signedIn: false }
  return { signedIn: true, subject: verified.value.subject, person: await findPerson(database, verified.value.subject) }
}
