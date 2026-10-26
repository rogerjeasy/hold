import { amountText, DEFAULT_WINDOW_MONTHS } from '@hold/domain'
import type { TrustHistory, TrustLadder } from '@hold/domain'

// The trust ladder form's starting values, as text the owner edits: the published ladder, or a modest first one.

export type RungDraft = { readonly cleanReturns: string; readonly share: string; readonly largestValue: string; readonly savedMethod: 'no' | 'yes' }

export type LadderDraft = {
  readonly history: TrustHistory
  readonly windowMonths: string
  readonly minimumFee: string
  readonly minimumHours: string
  readonly rungs: readonly RungDraft[]
}

const FIRST_LADDER: LadderDraft = {
  history: 'own',
  windowMonths: String(DEFAULT_WINDOW_MONTHS),
  minimumFee: '0',
  minimumHours: '0',
  rungs: [
    { cleanReturns: '3', share: '75', largestValue: '', savedMethod: 'no' },
    { cleanReturns: '5', share: '50', largestValue: '', savedMethod: 'no' },
  ],
}

export function ladderDraft(ladder: TrustLadder | undefined): LadderDraft {
  if (ladder === undefined) return FIRST_LADDER
  return {
    history: ladder.history,
    windowMonths: String(ladder.windowMonths),
    minimumFee: amountText(ladder.minimumFee),
    minimumHours: String(ladder.minimumHours),
    rungs: ladder.rungs.map((rung) => ({
      cleanReturns: String(rung.cleanReturns),
      share: String(rung.sharePercent),
      largestValue: rung.largestValue === undefined ? '' : amountText(rung.largestValue),
      savedMethod: rung.needsSavedMethod ? 'yes' : 'no',
    })),
  }
}
