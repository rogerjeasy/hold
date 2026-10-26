import type { acceptedEvalRun } from '@hold/db'
import type { ScorecardRun } from './scorecard-figures'

// Only what the scorecard shows leaves the server.
export function scorecardRun(run: Awaited<ReturnType<typeof acceptedEvalRun>>): ScorecardRun | undefined {
  return run === undefined ? undefined : { completedAt: run.completedAt, caseCount: run.caseCount, syntheticCount: run.syntheticCount, pipelineVersion: run.pipelineVersion, model: run.model, measures: run.measures, realMeasures: run.realMeasures }
}
