'use client'

import { useEffect } from 'react'
import { useRouter } from '@/i18n/navigation'

// Draws the page again from the server every few seconds while something is on its way, such as the worker placing a
// hold, and stops after a while so a page left open does not ask for ever.
export function useLookAgain(active: boolean, { everyMs = 2000, forMs = 60_000 }: { readonly everyMs?: number; readonly forMs?: number } = {}): void {
  const router = useRouter()
  useEffect(() => {
    if (!active) return
    const looking = setInterval(() => {
      router.refresh()
    }, everyMs)
    const giveUp = setTimeout(() => {
      clearInterval(looking)
    }, forMs)
    return () => {
      clearInterval(looking)
      clearTimeout(giveUp)
    }
  }, [active, everyMs, forMs, router])
}
