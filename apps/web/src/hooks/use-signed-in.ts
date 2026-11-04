import { useSyncExternalStore } from 'react'
import { HOST_PREFIX, SIGNED_IN_COOKIE } from '@/features/auth/cookie-settings'

// The flag carries the __Host- prefix wherever the cookies are Secure, and its plain name on a developer's machine.
const FLAGS = [`${HOST_PREFIX}${SIGNED_IN_COOKIE}=1`, `${SIGNED_IN_COOKIE}=1`]

function subscribe(): () => void {
  return () => undefined
}

// Whether this browser holds a session, from the readable flag the server sets beside it. For what the header shows
// only: every request checks the real session on the server. False on the server and during hydration.
export function useSignedIn(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => document.cookie.split('; ').some((cookie) => FLAGS.includes(cookie)),
    () => false,
  )
}
