'use client'

import type { ComparisonReport } from '@hold/db'
import { confidenceLevel, formatMoney, money } from '@hold/domain'
import { BadgeCheck, CircleSlash, ScanSearch, Tag } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { Panel } from '@/components/ui/panel'
import { StatusPill } from '@/components/ui/status-pill'
import type { StatusTone } from '@/components/ui/status-pill'
import { Link } from '@/i18n/navigation'
import { rentalRoutes } from '@/lib/routes'
import type { Calibration } from './comparison-screen'

type Finding = ComparisonReport['findings'][number]

const TONES: Readonly<Record<Finding['class'], StatusTone>> = {
  new_damage: 'danger',
  missing_part: 'danger',
  uncertain: 'attention',
  reported: 'progress',
  wear: 'neutral',
  known_mark: 'neutral',
}

// What is already accounted for: never priced, never given a confidence.
const ACCOUNTED: ReadonlySet<Finding['class']> = new Set(['known_mark', 'wear', 'reported'])

// Each observation as a card: what kind it is, in words on a pill; what was seen; whether a second look confirmed it;
// how far findings at its confidence were right in testing; and the agreed price it matches, as a suggestion.
export function ComparisonFindings({ findings, rentalId, viewName, calibration }: { findings: readonly Finding[]; rentalId: string; viewName: (view: string) => string; calibration?: Calibration | undefined }) {
  const t = useTranslations('shop.comparison')
  const scorecard = useTranslations('scorecard')
  const locale = useLocale()
  const accuracy = (confidence: number) => {
    const level = confidenceLevel(confidence)
    const measured = calibration?.[level]
    return measured === undefined || measured.total === 0 ? scorecard('findingLevel', { level: scorecard(`levels.${level}`) }) : scorecard('findingAccuracy', { level: scorecard(`levels.${level}`), ...measured })
  }
  if (findings.length === 0) return null
  return (
    <Panel title={t('observations')} icon={ScanSearch}>
      <ul className="stagger grid gap-3 p-4 md:p-5">
        {findings.map((finding) => (
          <li key={finding.id} className="grid min-w-0 gap-3 rounded-2xl border border-border/70 bg-background/60 p-4">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
              <StatusPill tone={TONES[finding.class]}>{t(`classes.${finding.class}`)}</StatusPill>
              <span className="label min-w-0 text-[0.6875rem] text-muted-foreground wrap-long-words">{viewName(finding.view)}</span>
            </div>
            <p className="text-pretty wrap-long-words">{finding.description}</p>
            {finding.secondLookConfirmed === null && ACCOUNTED.has(finding.class) ? null : (
              <div className="grid gap-1 text-sm text-muted-foreground">
                {finding.secondLookConfirmed === true ? <p className="flex items-start gap-1.5"><BadgeCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />{t('secondLook')}</p> : finding.secondLookConfirmed === false ? <p className="flex items-start gap-1.5"><CircleSlash aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t('secondLookNot')}</p> : null}
                {ACCOUNTED.has(finding.class) ? null : <p className="wrap-long-words">{accuracy(finding.confidence)}</p>}
              </div>
            )}
            {finding.reported === null ? null : (
              <p className="text-pretty">
                {finding.reported.agreedCents === null ? t('reportedNotAgreed') : t('reportedAgreed', { amount: formatMoney(money(finding.reported.agreedCents, finding.reported.currency), locale) })}{' '}
                <Link className="font-semibold underline decoration-border-strong underline-offset-4 hover:decoration-primary" href={rentalRoutes.claim(rentalId)}>{t(finding.reported.agreedCents === null ? 'claimLink' : 'reportedLink')}</Link>
              </p>
            )}
            {finding.amountCents !== null && finding.currency !== null && !ACCOUNTED.has(finding.class) ? (
              <p className="flex items-start gap-2 rounded-xl bg-primary/6 px-3 py-2.5 text-[0.9375rem] text-pretty">
                <Tag aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                <span className="min-w-0 wrap-long-words">{t('price', { description: finding.priceDescription ?? '', amount: formatMoney(money(finding.amountCents, finding.currency), locale) })}</span>
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </Panel>
  )
}
