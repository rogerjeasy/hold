import { checkLadder, fail, ok, parseAmount, TRUST_HISTORIES } from '@hold/domain'
import type { Result, TrustLadder, TrustRung } from '@hold/domain'
import { z } from 'zod'
import { list, withLocale } from '@/server/action'

// The trust ladder form, as the owner types it, read into a ladder in the shop's currency and checked by the rules in
// @hold/domain. A refusal names its rung from zero, as the form's rows are counted, so its message can number it.

export const ladderFields = withLocale({
  history: z.enum(TRUST_HISTORIES),
  windowMonths: z.string().max(4),
  minimumFee: z.string().max(20),
  minimumHours: z.string().max(5),
  cleanReturns: list(z.string().max(4)),
  share: list(z.string().max(4)),
  largestValue: list(z.string().max(20)),
  savedMethod: list(z.enum(['no', 'yes'])),
})

export type LadderFields = z.infer<typeof ladderFields>

const whole = (text: string): number | undefined => (/^\d{1,4}$/.test(text.trim()) ? Number(text.trim()) : undefined)

export function readLadder(fields: LadderFields, currency: string): Result<TrustLadder, string> {
  const rows = fields.cleanReturns.length
  if (fields.share.length !== rows || fields.largestValue.length !== rows || fields.savedMethod.length !== rows) return fail('rows_mismatched')
  const minimumFee = parseAmount(fields.minimumFee === '' ? '0' : fields.minimumFee, currency)
  if (minimumFee === undefined) return fail('minimum_fee_invalid')
  const rungs: TrustRung[] = []
  for (let index = 0; index < rows; index += 1) {
    const cleanReturns = whole(fields.cleanReturns[index] ?? '')
    const sharePercent = whole(fields.share[index] ?? '')
    if (cleanReturns === undefined) return fail(`clean_returns_invalid:${String(index)}`)
    if (sharePercent === undefined) return fail(`share_invalid:${String(index)}`)
    const valueText = (fields.largestValue[index] ?? '').trim()
    const largestValue = valueText === '' ? undefined : parseAmount(valueText, currency)
    if (valueText !== '' && largestValue === undefined) return fail(`cover_amount_invalid:${String(index)}`)
    rungs.push({ cleanReturns, sharePercent, largestValue, needsSavedMethod: fields.savedMethod[index] === 'yes' })
  }
  const windowMonths = whole(fields.windowMonths) ?? 0
  const minimumHours = whole(fields.minimumHours === '' ? '0' : fields.minimumHours) ?? -1
  const ladder: TrustLadder = { currency, history: fields.history, windowMonths, minimumFee, minimumHours, rungs }
  const [problem] = checkLadder(ladder)
  if (problem !== undefined) return fail('rung' in problem ? `${problem.kind}:${String(problem.rung - 1)}` : problem.kind)
  return ok(ladder)
}
