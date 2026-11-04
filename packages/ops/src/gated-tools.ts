import { auditAgentCall, inShop } from '@hold/db'
import type { Database } from '@hold/db'
import { gatewayDecision } from '@hold/domain'
import type { GatedTools } from './investigator.ts'
import type { PayPalReader } from './paypal-reader.ts'

// What a run has spent, shared by every exception it investigates.
export type RunBudget = { toolCalls: number; tokens: number }

export type GateContext = {
  readonly database: Database
  readonly shopId: string
  // The person the agent acts for: the shop's owner, resolved once for the run. None, and every call is refused.
  readonly actsFor: string | null
  readonly runId: string
  readonly subject: { readonly kind: string; readonly id: string }
  readonly reader: PayPalReader | undefined
  readonly budget: RunBudget
  // PayPal reads that answered for this exception: what decides whether the entry says PayPal was checked.
  readonly answered: { count: number }
  readonly maxToolCalls: number
  readonly now: () => Date
}

const isArguments = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null && !Array.isArray(value)

// Every PayPal tool call the model asks for passes the one gateway (extensions.md section 4.4), and every one,
// allowed or refused, gets an audit line with the shop, the run and the tool (X1.7). The model reads a refusal as
// text; it has no other way round it.
export function gatedTools(context: GateContext): GatedTools {
  const audit = (tool: string, outcome: string, milliseconds: number) =>
    inShop(context.database, { role: 'hold_worker', shopId: context.shopId }, (transaction) =>
      auditAgentCall(transaction, { runId: context.runId, tool: `paypal.${tool}`, subjectKind: context.subject.kind, subjectId: context.subject.id, actsFor: context.actsFor, outcome, milliseconds }, context.now()))
  return {
    tools: context.reader?.tools ?? [],
    async call(name, args) {
      const started = Date.now()
      const { reader } = context
      if (reader === undefined || !reader.tools.some((tool) => tool.name === name)) {
        await audit(name, 'refused', 0)
        return `Refused: the tool ${name} is not offered. Only the listed read tools exist.`
      }
      const decision = gatewayDecision({
        actor: { kind: 'shop_agent', shopId: context.shopId, actsFor: context.actsFor },
        tool: { name, tier: 'read' },
        subjectShopId: context.shopId,
        mandate: null,
        now: context.now(),
        callsInWindow: context.budget.toolCalls,
        rateLimit: context.maxToolCalls,
        argumentsValid: isArguments(args),
      })
      if (!decision.ok) {
        await audit(name, `refused_${decision.reason}`, 0)
        return `Refused: ${decision.reason}.`
      }
      context.budget.toolCalls += 1
      const read = await reader.call(name, args)
      if (read.ok) context.answered.count += 1
      await audit(name, read.ok ? 'ok' : read.reason, Date.now() - started)
      return read.ok ? read.text : 'PayPal could not answer this call.'
    },
  }
}
