'use client'

import { ErrorView } from '@/features/site/error-view'

export default function LocaleError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main id="main" className="flex-1">
      <ErrorView onRetry={retry} />
    </main>
  )
}
