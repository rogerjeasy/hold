// A skeleton while this page loads. Only pages that never answer "not found" have one: once a page streams, its status
// is sent, and a 404 would go out as 200.

import { PageSkeleton } from '@/components/ui/page-skeleton'

export default function Loading() {
  return <PageSkeleton />
}
