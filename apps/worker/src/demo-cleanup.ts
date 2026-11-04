import { isDemoSessionAddress } from '@hold/auth'
import type { DemoAccountRemoval } from '@hold/auth'
import { demoSessionsDue, pruneRateLimits, retireDemoSession } from '@hold/db'
import type { Database } from '@hold/db'
import { demoRetirementCutoff } from '@hold/domain'

// Run once a day by EventBridge Scheduler (infra/lib/demo-cleanup.ts): every demo older than a week loses its two
// accounts, then its shop is marked retired (architecture.md section 20.3). The accounts go first, so a shop is never
// marked while its accounts remain; a demo whose accounts could not all be removed is left for the next day's run.
// Only accounts on the demo's domain are removed, whoever else works in the shop.

export type DemoCleanupDependencies = {
  readonly database: Database
  readonly accounts: DemoAccountRemoval
  readonly now: () => Date
}

export async function retireOldDemos(dependencies: DemoCleanupDependencies): Promise<{ readonly retired: number; readonly failed: number }> {
  const now = dependencies.now()
  const cutoff = demoRetirementCutoff(now)
  let retired = 0
  let failed = 0
  for (const due of await demoSessionsDue(dependencies.database, cutoff)) {
    try {
      for (const email of due.emails.filter(isDemoSessionAddress)) await dependencies.accounts.remove(email)
      if (await retireDemoSession(dependencies.database, { shopId: due.shopId, cutoff, now })) retired += 1
    } catch (error) {
      failed += 1
      // Named by its shop, never by an address.
      console.warn(JSON.stringify({ event: 'demo_cleanup_failure', shopId: due.shopId, detail: error instanceof Error ? error.name : 'unknown' }))
    }
  }
  return { retired, failed }
}

// The daily run: old demos, then the rate limits whose windows ended long ago, which nothing else removes.
export async function runDailyCleanup(dependencies: DemoCleanupDependencies): Promise<{ readonly retired: number; readonly failed: number; readonly prunedLimits: number }> {
  const demos = await retireOldDemos(dependencies)
  return { ...demos, prunedLimits: await pruneRateLimits(dependencies.database) }
}
