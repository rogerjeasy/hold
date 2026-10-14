import { useSyncExternalStore } from 'react'

const SIGNED_IN_COOKIE = 'hold_signed_in'

function subscribe(): () => void {
  return () => undefined
}

// Whether this browser holds a session, from the readable flag the server sets beside it. For what the header shows
// only: every request checks the real session on the server. False on the server and during hydration.
export function useSignedIn(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => document.cookie.split('; ').some((cookie) => cookie === `${SIGNED_IN_COOKIE}=1`),
    () => false,
  )
}
