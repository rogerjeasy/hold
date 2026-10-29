'use client'

import type { CustomCellRendererProps } from 'ag-grid-react'
import { Check, UserRound, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { EVALUATION_GROUPS } from '@hold/domain'
import type { EvaluationGroup } from '@hold/domain'
import { SampleTag } from '@/components/ui/sample-tag'
import type { CaseRow } from './case-rows'
import { verdictCounts } from './case-rows'

type CellProps = CustomCellRendererProps<CaseRow>

const VERDICT_ICONS: Readonly<Record<CaseRow['verdict'], LucideIcon>> = { pass: Check, fail: X, person: UserRound }

const isGroup = (key: unknown): key is EvaluationGroup => EVALUATION_GROUPS.some((group) => group === key)

// A group's heading across the grid: the kind of pair and how many of its pairs the comparison got right.
export function CaseGroupLabel({ node }: CellProps) {
  const t = useTranslations('openScorecard')
  if (!isGroup(node.key)) return null
  const counts = verdictCounts(node.allLeafChildren?.flatMap((leaf) => (leaf.data === undefined ? [] : [leaf.data])) ?? [])
  return (
    <span className="flex min-w-0 flex-wrap items-baseline gap-x-3">
      <span className="font-semibold">{t(`groups.${node.key}`)}</span>
      <span className="figures text-sm text-muted-foreground">{t('groupRight', { pass: counts.pass, total: counts.total })}</span>
    </span>
  )
}

export function PairCell({ data }: CellProps) {
  const t = useTranslations('openScorecard')
  if (data === undefined) return null
  return (
    <div className="grid h-full min-w-0 content-center gap-0.5 leading-snug">
      <span className="truncate font-mono text-sm font-semibold">{data.id}</span>
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm text-muted-foreground">{t(`groups.${data.group}`)}</span>
        {data.origin === 'synthetic' ? <SampleTag label={t('synthetic')} /> : null}
      </div>
    </div>
  )
}

export function OutcomeCell({ value }: CustomCellRendererProps<CaseRow, CaseRow['actual']>) {
  const t = useTranslations('openScorecard')
  return value === undefined || value === null ? null : <span className="flex h-full items-center text-sm">{t(`outcomes.${value}`)}</span>
}

export function ClaimCell({ data }: CellProps) {
  const t = useTranslations('openScorecard')
  const levels = useTranslations('scorecard.levels')
  if (data === undefined) return null
  return (
    <span className="flex h-full min-w-0 items-center text-sm">
      <span className="truncate">{data.lead === null || data.level === null ? t('noClaim') : t('claimed', { class: t(`classes.${data.lead.class}`), level: levels(data.level) })}</span>
    </span>
  )
}

export function SecondLookCell({ data }: CellProps) {
  const t = useTranslations('openScorecard')
  return data === undefined ? null : <span className="flex h-full items-center text-sm">{t(`secondLook.${data.secondLook}`)}</span>
}

export function AlignmentCell({ data }: CellProps) {
  const t = useTranslations('openScorecard')
  if (data === undefined) return null
  return <span className="figures flex h-full items-center justify-end text-sm">{data.alignment === null ? t('noAlignment') : t('alignment', { percent: Math.round(data.alignment * 100) })}</span>
}

// Right, wrong or sent to a person, in a word and a sign, never by colour alone.
export function Verdict({ verdict }: { verdict: CaseRow['verdict'] }) {
  const t = useTranslations('openScorecard')
  const Icon = VERDICT_ICONS[verdict]
  return (
    <span className={verdict === 'fail' ? 'flex h-full min-w-0 items-center gap-1.5 font-semibold text-destructive' : verdict === 'pass' ? 'flex h-full min-w-0 items-center gap-1.5 font-semibold' : 'flex h-full min-w-0 items-center gap-1.5 text-muted-foreground'}>
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span className="truncate">{t(`verdicts.${verdict}`)}</span>
    </span>
  )
}

export function VerdictCell({ data }: CellProps) {
  return data === undefined ? null : <Verdict verdict={data.verdict} />
}
