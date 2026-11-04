import { completeOpsRun, exceptionFacts, inShop, operationsPrincipal, recordSampleInvestigation, sampleEntriesToInvestigate } from '@hold/db'
import type { Transaction } from '@hold/db'
import { SAMPLE_INVESTIGATION_TOKENS } from '@hold/domain'
import type { RunBudget } from './gated-tools.ts'
import { investigate } from './investigate-exception.ts'
import type { InvestigateDependencies } from './investigate-exception.ts'
import { OPS_LIMITS, OPS_PROMPT_VERSION } from './investigator.ts'
import type { OpsLimits } from './investigator.ts'
import { samplePayPalReader } from './sample-paypal-reader.ts'

// A demo shop's sample entries, investigated by the real investigator when its owner asks (extensions.md section
// 6.14), so the morning queue shows what the agent writes. The same investigation, gateway and ceilings as a nightly
// run; PayPal's read tools answer from the sample's own records, said to be simulated, since its references were never
// on PayPal. What the model answers is written over the sample entry, which stays a sample: approving it carries
// nothing out. No PayPal account is read, no reminder is sent, and nothing here moves money.
export async function investigateSamples(dependencies: InvestigateDependencies & { readonly limits?: OpsLimits }, input: { readonly shopId: string; readonly runId: string }): Promise<string> {
  const { shopId, runId } = input
  // A sample run stops at its own token ceiling, far below a nightly run's (packages/domain demo-limits.ts).
  const given = dependencies.limits ?? OPS_LIMITS
  const limits = { ...given, maxTokens: Math.min(given.maxTokens, SAMPLE_INVESTIGATION_TOKENS) }
  const now = dependencies.now()
  const asWorker = <Result>(work: (transaction: Transaction) => Promise<Result>) => inShop(dependencies.database, { role: 'hold_worker', shopId }, work)
  const entries = await asWorker((transaction) => sampleEntriesToInvestigate(transaction))
  const actsFor = await asWorker((transaction) => operationsPrincipal(transaction))
  const budget: RunBudget = { toolCalls: 0, tokens: 0 }
  const usage = { inputTokens: 0, outputTokens: 0, model: null as string | null }
  const stopAt = Date.now() + limits.maxMilliseconds
  let investigated = 0
  for (const entry of entries) {
    if (budget.toolCalls >= limits.maxToolCalls || budget.tokens >= limits.maxTokens || Date.now() >= stopAt) break
    const { exception } = entry
    const facts = await asWorker((transaction) => (exception.rentalId === null ? Promise.resolve(null) : exceptionFacts(transaction, 'rental', exception.rentalId)))
    const choice = await investigate(dependencies, { shopId, actsFor, exception, currency: entry.currency ?? undefined, candidates: exception.allowed, rules: [], reader: samplePayPalReader(facts), runId, budget, limits, stopAt, usage })
    // Only an answer of the entry's own kind is written over it; a fallback or a steered kind leaves it as it was.
    if (choice.reason === null || choice.model === null || choice.kind !== entry.kind) continue
    const answer = { reason: choice.reason, references: choice.references, draft: choice.draft, model: choice.model, promptVersion: OPS_PROMPT_VERSION, runId }
    if (await asWorker((transaction) => recordSampleInvestigation(transaction, entry.id, answer, now))) investigated += 1
  }
  const model = investigated === 0 ? null : usage.model
  await asWorker((transaction) => completeOpsRun(transaction, runId, { toolCalls: budget.toolCalls, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, model, promptVersion: model === null ? null : OPS_PROMPT_VERSION, paypalChecked: false, counts: { samples: 1, entries: entries.length, investigated } }, dependencies.now()))
  return runId
}
