'use client'

import { LoaderCircle } from 'lucide-react'
import { useLinkStatus } from 'next/link'
import type { ReactNode } from 'react'

// A link's own answer to a tap, before the next page or even its outline arrives: on a slow server the outline's
// prefetch is slow too (audit finding JW-L10). The icon turns to a spinner and the tap is announced. Must sit inside
// the link.
export function LinkPendingIcon({ children, opening }: { children: ReactNode; opening: string }) {
  const { pending } = useLinkStatus()
  return (
    <>
      {pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : children}
      <span role="status" className="sr-only">{pending ? opening : ''}</span>
    </>
  )
}
