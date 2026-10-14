'use client'

import { ErrorView } from '@/features/site/error-view'

export default function LocaleError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorView onRetry={retry} />
}
