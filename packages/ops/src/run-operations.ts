import { beginOpsRun, completeOpsRun, confirmedRules, decideProposal, exceptionsAwaitingOwner, inShop, liveStandingRule, recordExceptions, recordReminder, shopSnapshot, writeProposal } from '@hold/db'
import type { Database, RecordedException, Transaction } from '@hold/db'
import { detectExceptions, orderQueue, suppressedByRule } from '@hold/domain'
import type { DetectorKind, ReminderKind } from '@hold/domain'
import { z } from 'zod'
import type { RunBudget } from './gated-tools.ts'
import { fixedChoice, investigate } from './investigate-exception.ts'
import type { Choice } from './investigate-exception.ts'
import { OPS_LIMITS, OPS_PROMPT_VERSION } from './investigator.ts'
import type { Investigator, OpsLimits } from './investigator.ts'
import { paypalFacts } from './paypal-facts.ts'
import type { ShopPayPalReads } from './paypal-facts.ts'
import { investigateSamples } from './sample-investigation.ts'

export type { ShopPayPalReads } from './paypal-facts.ts'
export type Reminder = { readonly kind: ReminderKind; readonly shopId: string; readonly rentalId: string; readonly dueAt: Date | null }

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
  decision_promise_due: 'The shop promised the renter a decision on this contested claim within a day.',
  decision_promise_missed: 'The shop did not decide this contested claim by the date it promised; only the owner may decide it now.',
}

// One message on the ops-agent queue: from the nightly fan-out, a manual check by the owner (written to the outbox,
// which adds the shop), or when a dispute opens, a hold becomes at risk or a capture fails. samplesRunId: the run a
// demo shop's owner opened to have its samples investigated (section 6.14), which reads no PayPal account.
export const opsAgentMessageSchema = z.strictObject({ shopId: z.uuid(), trigger: z.enum(['nightly', 'dispute_opened', 'hold_at_risk', 'capture_failed', 'manual']), samplesRunId: z.uuid().optional() })

// One run for one shop (extensions.md section 6.3): detectors find the exceptions, reminders go out, the model
// investigates what needs a decision within the run's ceilings, and the owner's queue is written. Nothing here moves
// money; the owner's standing rule alone approves, through the same check as a person's approval.
export async function runOperations(dependencies: OpsDependencies, input: z.infer<typeof opsAgentMessageSchema>): Promise<string> {
  const { database } = dependencies
  const { shopId } = input
  const limits = dependencies.limits ?? OPS_LIMITS
  if (input.samplesRunId !== undefined) return investigateSamples({ ...dependencies, limits }, { shopId, runId: input.samplesRunId })
  const now = dependencies.now()
  const asWorker = <Result>(work: (transaction: Transaction) => Promise<Result>) => inShop(database, { role: 'hold_worker', shopId }, work)
  const runId = await asWorker((transaction) => beginOpsRun(transaction, input.trigger, now))
  const reads = await dependencies.paypal(shopId).catch(() => undefined)
  const { reached, ...fromPayPal } = await paypalFacts(database, shopId, reads)
  const snapshot = await asWorker((transaction) => shopSnapshot(transaction, now, fromPayPal))
  const found = detectExceptions(snapshot)
  const currencies = new Map(snapshot.holds.map((hold) => [hold.rentalId, hold.currency]))
  const recorded = await asWorker((transaction) => recordExceptions(transaction, runId, found, now))
  const rules = await asWorker((transaction) => confirmedRules(transaction))

  let reminders = 0
  let remindersFailed = 0
  for (const exception of recorded) {
    if (exception.reminder === null || exception.rentalId === null) continue
    const reminder = { kind: exception.reminder, shopId, rentalId: exception.rentalId, dueAt: exception.deadline }
    if (!await asWorker((transaction) => recordReminder(transaction, { kind: reminder.kind, rentalId: reminder.rentalId }, now))) continue
    // A reminder that could not be sent is counted on the run, not retried: at most one of a kind a day.
    try {
      await dependencies.remind(reminder)
      reminders += 1
    } catch {
      remindersFailed += 1
    }
  }

  // An exception whose proposal still waits for the owner was asked about already: asking again spends the model's
  // tokens on an answer the queue holds. PayPal's server is opened only when something is left to investigate.
  const awaiting = await asWorker((transaction) => exceptionsAwaitingOwner(transaction, recorded.map((each) => each.id)))
  const toDecide = orderQueue(recorded.filter((each) => each.allowed.length > 0 && !awaiting.has(each.id)))
  const opened = dependencies.investigator === undefined || reads === undefined || toDecide.length === 0 ? undefined : await reads.openReader().catch(() => undefined)
  const reader = opened?.ok === true ? opened.reader : undefined
  const budget: RunBudget = { toolCalls: 0, tokens: 0 }
  const usage = { inputTokens: 0, outputTokens: 0, model: null as string | null }
  const stopAt = Date.now() + limits.maxMilliseconds
  let proposals = 0
  try {
    for (const exception of toDecide) {
      const candidates = exception.allowed.filter((kind) => !suppressedByRule(rules, { proposalKind: kind, moneyCents: exception.moneyCents }))
      const [first] = candidates
      if (first === undefined) continue
      const withinCeilings = budget.toolCalls < limits.maxToolCalls && budget.tokens < limits.maxTokens && Date.now() < stopAt
      const choice = dependencies.investigator !== undefined && withinCeilings
        ? await investigate(dependencies, { shopId, exception, currency: exception.rentalId === null ? undefined : currencies.get(exception.rentalId), candidates, rules, reader, runId, budget, limits, stopAt, usage })
        : fixedChoice(first, false)
      proposals += await asWorker((transaction) => writeChoice(transaction, { exception, choice, runId, paypalChecked: choice.paypalConfirmed }, now))
    }
  } finally {
    await reader?.close().catch(() => undefined)
  }
  await asWorker((transaction) => completeOpsRun(transaction, runId, { toolCalls: budget.toolCalls, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, model: usage.model, promptVersion: usage.model === null ? null : OPS_PROMPT_VERSION, paypalChecked: reached && reader !== undefined, counts: { exceptions: recorded.length, proposals, reminders, remindersFailed } }, now))
  return runId
}

// Writes the queue entry, the agent's observations as notes, and, for a clean return nobody confirmed, applies the
// owner's standing rule if one is live. Returns how many proposals were written.
async function writeChoice(transaction: Transaction, entry: { readonly exception: RecordedException; readonly choice: Choice; readonly runId: string; readonly paypalChecked: boolean }, now: Date): Promise<number> {
  const { exception, choice, runId } = entry
  const payload: Record<string, string> = {
    ...(choice.reason === null ? { fixedReason: exception.kind } : {}),
    ...(choice.investigated ? {} : { investigated: 'no' }),
    ...(entry.paypalChecked ? {} : { paypalChecked: 'no' }),
    ...(choice.draftDropped ? { draftDropped: 'yes' } : {}),
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
