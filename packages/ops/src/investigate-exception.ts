import { exceptionFacts, inShop } from '@hold/db'
import type { Database, RecordedException } from '@hold/db'
import { guardNumbers, money } from '@hold/domain'
import type { OwnerRule, ProposalKind } from '@hold/domain'
import { gatedTools } from './gated-tools.ts'
import type { RunBudget } from './gated-tools.ts'
import { investigationSchema } from './investigator.ts'
import type { InvestigationAnswer, Investigator, OpsLimits } from './investigator.ts'
import type { PayPalReader } from './paypal-reader.ts'

// What goes on the queue for one exception. A null reason means the detector's fixed reason.
export type Choice = {
  readonly kind: ProposalKind
  readonly reason: string | null
  readonly references: readonly string[]
  readonly draft: string | null
  readonly model: string | null
  readonly investigated: boolean
  readonly draftDropped: boolean
  readonly paypalConfirmed: boolean
  readonly observations: InvestigationAnswer['observations']
}
export const fixedChoice = (kind: ProposalKind, investigated: boolean): Choice => ({ kind, reason: null, references: [], draft: null, model: null, investigated, draftDropped: false, paypalConfirmed: false, observations: [] })

export type InvestigateDependencies = { readonly database: Database; readonly now: () => Date; readonly investigator: Investigator | undefined }

export type Investigation = {
  readonly shopId: string
  // The owner the agent acts for, as the run resolved it.
  readonly actsFor: string | null
  readonly exception: RecordedException
  // The currency of the amount the exception names; unknown, no number may stand in a draft.
  readonly currency: string | undefined
  readonly candidates: readonly ProposalKind[]
  readonly rules: readonly OwnerRule[]
  readonly reader: PayPalReader | undefined
  readonly runId: string
  readonly budget: RunBudget
  readonly limits: OpsLimits
  readonly stopAt: number
  readonly usage: { inputTokens: number; outputTokens: number; model: string | null }
}

// Asks the model about one exception. Anything but a valid answer of an allowed kind falls back to the detector's
// first allowed kind with the fixed reason: a refusal, an outage, or an answer steered toward another kind.
export async function investigate(dependencies: InvestigateDependencies, work: Investigation): Promise<Choice> {
  const { exception, candidates } = work
  const fallback = fixedChoice(candidates[0] ?? 'note', true)
  const investigator = dependencies.investigator
  if (investigator === undefined) return fallback
  // Only ever serialized for the model, so its shape is not needed here.
  const facts = await inShop<unknown>(dependencies.database, { role: 'hold_worker', shopId: work.shopId }, (transaction) =>
    exception.rentalId === null ? Promise.resolve({ subjectKind: exception.subjectKind, subjectId: exception.subjectId }) : exceptionFacts(transaction, 'rental', exception.rentalId))
  const answered = { count: 0 }
  const tools = gatedTools({ database: dependencies.database, shopId: work.shopId, actsFor: work.actsFor, runId: work.runId, subject: { kind: exception.subjectKind, id: exception.subjectId }, reader: work.reader, budget: work.budget, answered, maxToolCalls: work.limits.maxToolCalls, now: dependencies.now })
  const signal = AbortSignal.timeout(Math.max(1, work.stopAt - Date.now()))
  const result = await investigator.investigate(
    { exceptionKind: exception.kind, allowed: candidates, deadline: exception.deadline, facts: JSON.stringify({ exception: { kind: exception.kind, subjectKind: exception.subjectKind, subjectId: exception.subjectId, moneyCents: exception.moneyCents }, records: facts }), rules: work.rules, paypalAvailable: work.reader !== undefined },
    tools,
    { toolCalls: work.limits.toolCallsPerException, signal },
  ).catch(() => undefined)
  if (result === undefined) return fallback
  work.budget.tokens += result.inputTokens + result.outputTokens
  work.usage.inputTokens += result.inputTokens
  work.usage.outputTokens += result.outputTokens
  work.usage.model = result.model
  if (result.kind !== 'result') return fallback
  const parsed = investigationSchema.safeParse(result.data)
  if (!parsed.success) return fallback
  const { proposalKind, reason, references, draft, paypalConfirmed, observations } = parsed.data
  // A kind the detector does not allow is the mark of a steered answer: only its observations, which can be notes
  // and nothing else, are kept.
  if (!candidates.includes(proposalKind)) return { ...fallback, model: result.model, observations }
  // The model's word that it checked PayPal counts only if a PayPal read for this exception actually answered.
  // A draft is a message about money: every number in it must be the amount the records hold (section 6.7).
  const guarded = draft === null ? null : guardNumbers(draft, work.currency === undefined ? [] : [money(exception.moneyCents, work.currency)])
  return { kind: proposalKind, reason, references, draft: guarded, model: result.model, investigated: true, draftDropped: draft !== null && guarded === null, paypalConfirmed: paypalConfirmed && answered.count > 0, observations }
}
