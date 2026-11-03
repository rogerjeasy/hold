'use client'

import { ErrorView } from '@/features/site/error-view'

// Inside the shop's frame, so the menu stays and the person can go elsewhere: the error on a card of its own, in the
// page's own margins.
export default function ShopError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="mx-auto w-full max-w-app px-4 pt-6 pb-14 md:px-8 md:pt-9 lg:px-10">
      <div className="surface mx-auto max-w-2xl animate-rise overflow-clip">
        <ErrorView onRetry={retry} />
      </div>
    </div>
  )
}
