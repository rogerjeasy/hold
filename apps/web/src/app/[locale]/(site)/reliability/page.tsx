import { acceptedEvalRun, gateRunHistory, outsideShop } from '@hold/db'
import { GridLicence } from '@/components/grid/grid-licence'
import { pageMetadata } from '@/features/marketing/page-metadata'
import { ReliabilityScreen } from '@/features/marketing/screens/reliability-screen'
import { scorecardRun } from '@/features/scorecard/scorecard-run'
import { getServices } from '@/server/services'

export const generateMetadata = pageMetadata('reliability')
// The figures change when a new run is accepted, so the page is read on each visit.
export const dynamic = 'force-dynamic'

// The accepted run's figures and every pair behind them, and every run of the gate half for run against run.
export default async function Page() {
  const { config, database } = await getServices()
  const run = await outsideShop(database, acceptedEvalRun)
  const history = await outsideShop(database, gateRunHistory)
  return (
    <>
      <GridLicence licenceKey={config.gridLicenceKey} />
      <ReliabilityScreen run={scorecardRun(run)} cases={run?.cases ?? []} history={history} />
    </>
  )
}
