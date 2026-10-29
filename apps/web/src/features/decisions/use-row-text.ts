import { HOLD_VALIDITY_DAYS } from '@hold/domain'
import { useTranslations } from 'next-intl'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'
import type { BoardRow, ProposalRow } from './board'

const CLAIM_KINDS = ['claim', 'contested', 'escalated'] as const
type ClaimKind = (typeof CLAIM_KINDS)[number]
const isClaimKind = (kind: BoardRow['kind']): kind is ClaimKind => CLAIM_KINDS.some((each) => each === kind)

// How each row of the board reads, in the viewer's language and on the shop's clock. The grid, the list on a phone,
// the chosen decision and the search all read rows through this, so they always say the same thing.
export function useRowText(clock: ShopClock) {
  const t = useTranslations('decisions')
  const operations = useTranslations('operations')
  const format = useShopFormat(clock)
  const renter = (row: BoardRow) => row.renterName ?? t('renter')
  const moment = (at: Date) => `${format.day(at)}, ${format.time(at)}`
  const money = (cents: number | null) => (cents === null ? '—' : format.money(cents))

  const reason = (row: ProposalRow) => (row.fixedReason === null ? row.reason : operations(`fixedReasons.${row.fixedReason}`))

  // The short name of what is asked, for the grid's first column.
  const title = (row: BoardRow): string => {
    switch (row.kind) {
      case 'claim':
      case 'contested':
      case 'escalated':
        return t(`titles.${row.kind}`)
      case 'proposal':
        return operations(`kinds.${row.proposalKind}.action`)
      case 'incident':
        return t('titles.incident', { kind: t(`incidentKinds.${row.incidentKind ?? 'unsorted'}`), item: row.itemLabel })
      case 'hold_ending':
        return t('titles.hold_ending', { renter: renter(row), when: format.when(row.validUntil) })
      case 'late':
        return t('titles.late', { renter: renter(row) })
      case 'dropped_off':
        return t('titles.dropped_off', { renter: renter(row) })
      case 'extension_payment':
        return t('titles.extension_payment', { renter: renter(row) })
    }
  }

  // The same, with the amount where it is the point of the decision: a heading that stands on its own.
  const heading = (row: BoardRow): string => (isClaimKind(row.kind) ? t(`headings.${row.kind}`, { amount: money(row.amountCents) }) : title(row))

  // The line under the title: who and what it is about.
  const subject = (row: BoardRow): string => {
    switch (row.kind) {
      case 'claim':
      case 'contested':
      case 'escalated':
        return [renter(row), row.lines[0]?.description].filter((part) => part !== undefined).join(' · ')
      case 'proposal':
        return reason(row)
      case 'incident':
        return renter(row)
      case 'hold_ending':
        return t('holdLine', { day: row.day, max: HOLD_VALIDITY_DAYS, amount: money(row.amountCents) })
      case 'late':
        return t('lateLine', { when: moment(row.endsAt) })
      case 'dropped_off':
        return t('dropOffLine', { items: row.items.map((item) => item.label).join(', '), when: moment(row.droppedOffAt) })
      case 'extension_payment':
        return t(`extensionLine.${row.attention}`, { captured: money(row.amountCents), quoted: money(row.quotedCents) })
    }
  }

  const due = (row: BoardRow): string => {
    if (row.due === null) return t('due.none')
    return row.overdue ? t('due.overdue', { when: moment(row.due) }) : t('due.by', { when: moment(row.due) })
  }

  // Everything a person might type to find a row: its words on screen, the renter, the item and PayPal's references.
  const searchText = (row: BoardRow): string =>
    [
      title(row),
      subject(row),
      row.renterName ?? '',
      row.kind === 'proposal' ? row.references.join(' ') : '',
      row.kind === 'extension_payment' ? row.paypalCaptureId : '',
      row.kind === 'incident' ? `${row.itemLabel} ${row.description}` : '',
      isClaimKind(row.kind) && 'lines' in row ? row.lines.map((line) => line.description).join(' ') : '',
    ].join(' ')

  return {
    timeZone: clock.timeZone,
    title,
    heading,
    subject,
    due,
    reason,
    moment,
    money,
    searchText,
    dueNone: () => t('due.none'),
    overdueWord: () => t('due.overdueWord'),
    decider: (row: BoardRow) => t(`deciders.${row.decider}`),
    deciderLine: (row: BoardRow) => t(`deciderLine.${row.decider}`),
    choose: (row: BoardRow) => t('choose', { amount: money(row.amountCents) }),
  }
}

export type RowText = ReturnType<typeof useRowText>
