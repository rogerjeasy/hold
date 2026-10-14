import { useSyncExternalStore } from 'react'

function subscribe(): () => void {
  return () => undefined
}

// False on the server and during hydration, true afterwards, with no extra render pass.
export function useMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
}
