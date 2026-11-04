// A skeleton while this page loads, so the first tap on "New rental" answers at once on a slow server (audit finding
// JW-L10). Only pages that never answer "not found" have one: once a page streams, its status is sent, and a 404 would
// go out as 200. This one only ever redirects, which still happens once it streams.

import { PageSkeleton } from '@/components/ui/page-skeleton'

export default function Loading() {
  return <PageSkeleton />
}
