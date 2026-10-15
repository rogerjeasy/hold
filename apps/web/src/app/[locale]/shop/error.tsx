'use client'

import { ErrorView } from '@/features/site/error-view'

// Inside the shop's frame, so the menu stays and the person can go elsewhere.
export default function ShopError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorView onRetry={retry} />
}
