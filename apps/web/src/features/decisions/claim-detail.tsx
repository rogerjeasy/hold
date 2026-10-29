import { useTranslations } from 'next-intl'
import { PhotoWithMarks } from '@/components/photo-with-marks'
import { Link } from '@/i18n/navigation'
import { rentalRoutes } from '@/lib/routes'
import type { ClaimRow } from './board'
import { detailLinkClass, Fact, SubHeading } from '@/components/detail-parts'
import { RenterWords } from './detail-parts'
import type { RowText } from './use-row-text'

type ClaimDetailProps = { row: ClaimRow; text: RowText; photoUrls: Readonly<Record<string, string>> }

// A claim as the person deciding it needs it: the renter's words, each line and where it came from, the two
// photographs of the first line that has them with its mark outlined on the return, and how the hold would be split.
// Approving and deciding happen on the claim's own page, with its passkey and limits.
export function ClaimDetail({ row, text, photoUrls }: ClaimDetailProps) {
  const t = useTranslations('decisions.detail')
  const pictured = row.lines.flatMap((line) => {
    const before = line.beforeKey === null ? undefined : photoUrls[line.beforeKey]
    const after = line.afterKey === null ? undefined : photoUrls[line.afterKey]
    return before === undefined || after === undefined ? [] : [{ line, before, after }]
  })[0]
  return (
    <>
      {row.renterComment === null ? null : <RenterWords words={row.renterComment} />}
      <section className="grid gap-2" aria-label={t('lines')}>
        <SubHeading>{t('lines')}</SubHeading>
        <ul className="grid divide-y border">
          {row.lines.map((line) => (
            <li key={line.id} className="grid gap-1 px-3 py-2.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="min-w-0 font-semibold wrap-long-words">{line.description}</span>
                <span className="figures">{text.money(line.amountCents)}</span>
              </div>
              <span className="text-sm text-muted-foreground">{t(`source.${line.source}`)}</span>
              {line.reason === null ? null : <p className="text-sm whitespace-pre-wrap wrap-long-words">{line.reason}</p>}
            </li>
          ))}
        </ul>
      </section>
      {pictured === undefined ? null : (
        <div className="grid gap-3 @md:grid-cols-2">
          <figure className="grid content-start gap-1.5">
            <figcaption className="text-sm text-muted-foreground">{t('handover')}</figcaption>
            <PhotoWithMarks src={pictured.before} alt={t('atHandover', { line: pictured.line.description })} marks={[]} />
          </figure>
          <figure className="grid content-start gap-1.5">
            <figcaption className="text-sm text-muted-foreground">{t('return')}</figcaption>
            {/* The mark's region is in the return photograph's frame, so it is outlined there alone. */}
            <PhotoWithMarks src={pictured.after} alt={t('atReturn', { line: pictured.line.description })} marks={pictured.line.region === null ? [] : [{ id: pictured.line.id, region: pictured.line.region }]} />
          </figure>
        </div>
      )}
      {row.settlement === null ? null : (
        <section className="grid gap-2" aria-label={t('split')}>
          <SubHeading>{t('split')}</SubHeading>
          <dl className="grid grid-cols-2 gap-3 @md:grid-cols-3">
            <Fact label={t('capture')} value={text.money(row.settlement.captureCents)} testId="split-capture" />
            <Fact label={t('release')} value={text.money(row.settlement.releaseCents)} testId="split-release" />
            {row.settlement.invoiceCents === 0 ? null : <Fact label={t('invoice')} value={text.money(row.settlement.invoiceCents)} testId="split-invoice" />}
          </dl>
        </section>
      )}
      {row.kind === 'claim' ? <p className="text-sm text-muted-foreground">{t('claimNote')}</p> : null}
      {row.rentalId === null ? null : (
        <Link href={rentalRoutes.claim(row.rentalId)} className={detailLinkClass}>
          {row.kind === 'claim' ? t('openClaim') : t('openDecision')}
        </Link>
      )}
    </>
  )
}
