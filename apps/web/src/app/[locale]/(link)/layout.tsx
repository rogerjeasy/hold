import type { ReactNode } from 'react'
import { LinkFrame } from '@/features/site/link-frame'

export default function LinkLayout({ children }: { children: ReactNode }) {
  return <LinkFrame>{children}</LinkFrame>
}
