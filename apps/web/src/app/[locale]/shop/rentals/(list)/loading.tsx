// A skeleton while this page loads. The page sits in a group of its own so the skeleton does not reach the pages below
// it, which may answer "not found": once a page streams, a 404 would go out as 200.

import { PageSkeleton } from '@/components/ui/page-skeleton'

export default function Loading() {
  return <PageSkeleton />
}
