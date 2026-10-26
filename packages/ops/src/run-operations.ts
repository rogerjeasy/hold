import { beginOpsRun, completeOpsRun, confirmedRules, decideProposal, exceptionFacts, inShop, liveStandingRule, recordExceptions, recordReminder, shopSnapshot, writeProposal } from '@hold/db'
import type { Database, RecordedException, Transaction } from '@hold/db'
import { detectExceptions, orderQueue, suppressedByRule } from '@hold/domain'
import type { DetectorKind, OwnerRule, ProposalKind, ReminderKind } from '@hold/domain'
import { gatedTools } from './gated-tools.ts'
import type { RunBudget } from './gated-tools.ts'
import { investigationSchema, OPS_LIMITS, OPS_PROMPT_VERSION } from './investigator.ts'
import type { InvestigationAnswer, Investigator, OpsLimits } from './investigator.ts'
import { paypalFacts } from './paypal-facts.ts'
import type { ShopPayPalReads } from './paypal-facts.ts'
import type { PayPalReader } from './paypal-reader.ts'

export type { ShopPayPalReads } from './paypal-facts.ts'
export type Reminder = { readonly kind: ReminderKind; readonly shopId: string; readonly rentalId: string }

export type OpsDependencies = {
  readonly database: Database
  readonly now: () => Date
  // Absent when Claude cannot be reached: the queue is then built from the detectors alone (X1.6).
  readonly investigator: Investigator | undefined
  readonly paypal: (shopId: string) => Promise<ShopPayPalReads | undefined>
  // Sends one fixed-template reminder. It is recorded first, so a repeated run sends none twice.
  readonly remind: (reminder: Reminder) => Promise<void>
  readonly limits?: OpsLimits
}

// The reason an entry carries when no investigation gave one. The screen shows its translation by detector.
const FIXED_REASONS: Readonly<Record<DetectorKind, string>> = {
  clean_return_unconfirmed: 'The comparison was clean and nobody has confirmed the return.',
  hold_ending: 'The hold ends within three days and the rental is still open.',
  hold_at_risk: 'The hold could not be renewed and the charge has not completed.',
  return_overdue: 'The rental is past its end.',
  claim_reply_due: 'The renter\'s reply to the claim is due within a day.',
  balance_above_hold: 'The decided claim is more than the hold and no invoice exists.',
  capture_failed: 'Taking the charge from the hold failed after its retry.',
  invoice_unpaid: 'The invoice is still unpaid.',
  dispute_open: 'A PayPal dispute is waiting for a response.',
  incident_waiting: 'An incident has waited for staff longer than the shop allows.',
  reconciliation_difference: 'PayPal\'s record of a hold differs from Hold\'s.',
}

// What goes on the queue for one exception. A null reason means the detector's fixed reason.
type Choice = {
  readonly kind: ProposalKind
  readonly reason: string | null
  readonly references: readonly string[]
  readonly draft: string | null
  readonly model: string | null
  readonly investigated: boolean
  readonly paypalConfirmed: boolean
  readonly observations: InvestigationAnswer['observations']
}
const fixedChoice = (kind: ProposalKind, investigated: boolean): Choice => ({ kind, reason: null, references: [], draft: null, model: null, investigated, paypalConfirmed: false, observations: [] })

// One run for one shop (extensions.md section 6.3): detectors find the exceptions, reminders go out, the model
// investigates what needs a decision within the run's ceilings, and the owner's queue is written. Nothing here moves
// money; the owner's standing rule alone approves, through the same check as a person's approval.
export async function runOperations(dependencies: OpsDependencies, input: { readonly shopId: string; readonly trigger: 'nightly' | 'dispute_opened' | 'hold_at_risk' | 'capture_failed' | 'manual' }): Promise<string> {
  const { database } = dependencies
  const { shopId } = input
  const limits = dependencies.limits ?? OPS_LIMITS
  const now = dependencies.now()
  const asWorker = <Result>(work: (transaction: Transaction) => Promise<Result>) => inShop(database, { role: 'hold_worker', shopId }, work)
  const runId = await asWorker((transaction) => beginOpsRun(transaction, input.trigger, now))
  const reads = await dependencies.paypal(shopId).catch(() => undefined)
  const { reached, ...fromPayPal } = await paypalFacts(database, shopId, reads)
  const found = detectExceptions(await asWorker((transaction) => shopSnapshot(transaction, now, fromPayPal)))
  const recorded = await asWorker((transaction) => recordExceptions(transaction, runId, found, now))
  const rules = await asWorker((transaction) => confirmedRules(transaction))

  let reminders = 0
  for (const exception of recorded) {
    if (exception.reminder === null || exception.rentalId === null) continue
    const reminder = { kind: exception.reminder, shopId, rentalId: exception.rentalId }
    if (!await asWorker((transaction) => recordReminder(transaction, reminder, now))) continue
    await dependencies.remind(reminder)
    reminders += 1
  }

  const opened = dependencies.investigator === undefined || reads === undefined ? undefined : await reads.openReader().catch(() => undefined)
  const reader = opened?.ok === true ? opened.reader : undefined
  const budget: RunBudget = { toolCalls: 0, tokens: 0 }
  const usage = { inputTokens: 0, outputTokens: 0, model: null as string | null }
  const stopAt = Date.now() + limits.maxMilliseconds
  let proposals = 0
  try {
    for (const exception of orderQueue(recorded.filter((each) => each.allowed.length > 0))) {
      const candidates = exception.allowed.filter((kind) => !suppressedByRule(rules, { proposalKind: kind, moneyCents: exception.moneyCents }))
      const [first] = candidates
      if (first === undefined) continue
      const withinCeilings = budget.toolCalls < limits.maxToolCalls && budget.tokens < limits.maxTokens && Date.now() < stopAt
      const choice = dependencies.investigator !== undefined && withinCeilings
        ? await investigate(dependencies, { shopId, exception, candidates, rules, reader, runId, budget, limits, stopAt, usage })
        : fixedChoice(first, false)
      proposals += await asWorker((transaction) => writeChoice(transaction, { exception, choice, runId, paypalChecked: reader !== undefined && choice.paypalConfirmed }, now))
    }
  } finally {
    await reader?.close().catch(() => undefined)
  }
  await asWorker((transaction) => completeOpsRun(transaction, runId, { toolCalls: budget.toolCalls, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, model: usage.model, promptVersion: usage.model === null ? null : OPS_PROMPT_VERSION, paypalChecked: reached && reader !== undefined, counts: { exceptions: recorded.length, proposals, reminders } }, now))
  return runId
}

type Investigation = {
  readonly shopId: string
  readonly exception: RecordedException
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
async function investigate(dependencies: OpsDependencies, work: Investigation): Promise<Choice> {
  const { exception, candidates } = work
  const fallback = fixedChoice(candidates[0] ?? 'note', true)
  const investigator = dependencies.investigator
  if (investigator === undefined) return fallback
  const facts = await inShop(dependencies.database, { role: 'hold_worker', shopId: work.shopId }, (transaction) =>
    exception.rentalId === null ? Promise.resolve({ subjectKind: exception.subjectKind, subjectId: exception.subjectId }) : exceptionFacts(transaction, 'rental', exception.rentalId))
  const tools = gatedTools({ database: dependencies.database, shopId: work.shopId, runId: work.runId, subject: { kind: exception.subjectKind, id: exception.subjectId }, reader: work.reader, budget: work.budget, maxToolCalls: work.limits.maxToolCalls, now: dependencies.now })
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
  return { kind: proposalKind, reason, references, draft, model: result.model, investigated: true, paypalConfirmed, observations }
}

// Writes the queue entry, the agent's observations as notes, and, for a clean return nobody confirmed, applies the
// owner's standing rule if one is live. Returns how many proposals were written.
async function writeChoice(transaction: Transaction, entry: { readonly exception: RecordedException; readonly choice: Choice; readonly runId: string; readonly paypalChecked: boolean }, now: Date): Promise<number> {
  const { exception, choice, runId } = entry
  const payload: Record<string, string> = {
    ...(choice.reason === null ? { fixedReason: exception.kind } : {}),
    ...(choice.investigated ? {} : { investigated: 'no' }),
    ...(entry.paypalChecked ? {} : { paypalChecked: 'no' }),
  }
  const promptVersion = choice.model === null ? null : OPS_PROMPT_VERSION
  const written = await writeProposal(transaction, { exceptionId: exception.id, kind: choice.kind, reason: choice.reason ?? FIXED_REASONS[exception.kind], references: choice.references, draft: choice.draft, raisedByAgent: false, runId, model: choice.model, promptVersion, payload }, now)
  let count = written.written ? 1 : 0
  for (const observation of exception.rentalId === null ? [] : choice.observations) {
    const noted = await writeProposal(transaction, { exceptionId: null, kind: 'note', reason: observation.reason, references: observation.references, draft: null, raisedByAgent: true, runId, model: choice.model, promptVersion, subject: { kind: 'rental', id: exception.rentalId ?? '', rentalId: exception.rentalId } }, now)
    if (noted.written) count += 1
  }
  if (written.written && choice.kind === 'release_hold' && exception.kind === 'clean_return_unconfirmed') {
    const mandate = await liveStandingRule(transaction, now)
    // The same check as a person's approval, mandate and daily count included. A refusal leaves it on the queue.
    if (mandate !== undefined) await decideProposal(transaction, written.id, null, { decision: 'approve', reason: '', mandateId: mandate.id }, now)
  }
  return count
}
