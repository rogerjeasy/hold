import { acceptedEvalRun, outsideShop } from '@hold/db'
import { pageMetadata } from '@/features/marketing/page-metadata'
import { ReliabilityScreen } from '@/features/marketing/screens/reliability-screen'
import { scorecardRun } from '@/features/scorecard/scorecard-run'
import { getServices } from '@/server/services'

export const generateMetadata = pageMetadata('reliability')
// The figures change when a new run is accepted, so the page is read on each visit.
export const dynamic = 'force-dynamic'

export default async function Page() {
  const { database } = await getServices()
  return <ReliabilityScreen run={scorecardRun(await outsideShop(database, acceptedEvalRun))} />
}
