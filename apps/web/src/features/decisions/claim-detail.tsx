import { ArrowRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { PhotoWithMarks } from '@/components/photo-with-marks'
import { buttonVariants } from '@/components/ui/button'
import { ContestSummaryPanel } from '@/features/contest/contest-summary-panel'
import { Link } from '@/i18n/navigation'
import { rentalRoutes } from '@/lib/routes'
import type { ClaimRow } from './board'
import { detailLinkClass, Fact, SubHeading } from '@/components/detail-parts'
import { RenterWords } from './detail-parts'
import type { RowText } from './use-row-text'

type ClaimDetailProps = { row: ClaimRow; text: RowText; photoUrls: Readonly<Record<string, string>> }

// Where the claim page is reached from here: to approve or decide it for whoever may (the primary action of the
// opened claim), and only to read it for anyone else, whose decider note says who does.
function ClaimLink({ row, rentalId }: { row: ClaimRow; rentalId: string }) {
  const t = useTranslations('decisions')
  if (row.decider !== 'you') {
    return <Link href={rentalRoutes.claim(rentalId)} className={detailLinkClass}>{t('menu.claim')}<ArrowRight aria-hidden="true" /></Link>
  }
  return (
    <Link href={rentalRoutes.claim(rentalId)} className={buttonVariants({ className: 'justify-self-start' })}>
      {row.kind === 'claim' ? t('detail.openClaim') : t('detail.openDecision')}
      <ArrowRight aria-hidden="true" />
    </Link>
  )
}

// A claim as the person deciding it needs it: the renter's words, each line and where it came from, the two
// photographs of the first line that has them with its mark outlined on the return, and how the hold would be split.
// A contested claim opens on the neutral summary of where the two sides differ, which pictures each disputed line
// itself. Approving and deciding happen on the claim's own page, with its passkey and limits.
export function ClaimDetail({ row, text, photoUrls }: ClaimDetailProps) {
  const t = useTranslations('decisions.detail')
  const urlOf = (key: string | null) => (key === null ? null : (photoUrls[key] ?? null))
  const pictured = row.contest !== null ? undefined : row.lines.flatMap((line) => {
    const before = line.beforeKey === null ? undefined : photoUrls[line.beforeKey]
    const after = line.afterKey === null ? undefined : photoUrls[line.afterKey]
    return before === undefined || after === undefined ? [] : [{ line, before, after }]
  })[0]
  return (
    <>
      {row.contest === null ? null : (
        <ContestSummaryPanel
          view={row.contest}
          audience="shop"
          timeZone={text.timeZone}
          photos={Object.fromEntries(row.lines.map((line) => [line.id, { before: urlOf(line.beforeKey), after: urlOf(line.afterKey), region: line.region }]))}
          rentalId={row.rentalId ?? undefined}
          canRewrite={row.decider === 'you' || row.decider === 'another_senior'}
        />
      )}
      {/* Without a summary the panel quotes the renter itself. */}
      {row.renterComment === null || row.contest?.version === null ? null : <RenterWords words={row.renterComment} />}
      <section className="grid gap-2" aria-label={t('lines')}>
        <SubHeading>{t('lines')}</SubHeading>
        <ul className="grid divide-y divide-border/70 overflow-clip rounded-xl border border-border/70 bg-card">
          {row.lines.map((line) => (
            <li key={line.id} className="grid gap-1 px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="min-w-0 font-semibold wrap-long-words">{line.description}</span>
                <span className="figures font-semibold">{text.money(line.amountCents)}</span>
              </div>
              <span className="text-sm text-muted-foreground">{t(`source.${line.source}`)}</span>
              {line.reason === null ? null : <p className="text-sm whitespace-pre-wrap wrap-long-words">{line.reason}</p>}
            </li>
          ))}
        </ul>
      </section>
      {pictured === undefined ? null : (
        <div className="grid gap-3 @md:grid-cols-2">
          <figure className="grid content-start gap-2">
            <figcaption className="label text-xs text-muted-foreground">{t('handover')}</figcaption>
            <div className="overflow-clip rounded-xl bg-photo">
              <PhotoWithMarks src={pictured.before} alt={t('atHandover', { line: pictured.line.description })} marks={[]} />
            </div>
          </figure>
          <figure className="grid content-start gap-2">
            <figcaption className="label text-xs text-muted-foreground">{t('return')}</figcaption>
            {/* The mark's region is in the return photograph's frame, so it is outlined there alone. */}
            <div className="overflow-clip rounded-xl bg-photo">
              <PhotoWithMarks src={pictured.after} alt={t('atReturn', { line: pictured.line.description })} marks={pictured.line.region === null ? [] : [{ id: pictured.line.id, region: pictured.line.region }]} />
            </div>
          </figure>
        </div>
      )}
      {row.settlement === null ? null : (
        <section className="grid gap-2" aria-label={t('split')}>
          <SubHeading>{t('split')}</SubHeading>
          <dl className="grid grid-cols-2 gap-2.5 @md:grid-cols-3">
            <Fact label={t('capture')} value={text.money(row.settlement.captureCents)} testId="split-capture" />
            <Fact label={t('release')} value={text.money(row.settlement.releaseCents)} testId="split-release" />
            {row.settlement.invoiceCents === 0 ? null : <Fact label={t('invoice')} value={text.money(row.settlement.invoiceCents)} testId="split-invoice" />}
          </dl>
        </section>
      )}
      {row.kind === 'claim' ? <p className="max-w-prose text-sm text-muted-foreground">{t('claimNote')}</p> : null}
      {row.rentalId === null ? null : <ClaimLink row={row} rentalId={row.rentalId} />}
    </>
  )
}
