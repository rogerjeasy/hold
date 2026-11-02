import type { PhotoSource, PhotoTaker } from '@hold/domain'
import { shortSeal } from '@hold/domain'
import { useTranslations } from 'next-intl'
import { useShopFormat } from '@/hooks/use-shop-format'

export type ProvenanceView = {
  readonly takenAt: Date
  readonly takenBy: PhotoTaker
  readonly source: PhotoSource | null
  readonly sha256: string
  readonly sealedAt: Date | null
}

// Under an evidence photograph (architecture.md section 9.7): when Hold's server received it, who took it, how, the
// start of its SHA-256 fingerprint with the whole one on hover, and when its session was sealed.
export function PhotoProvenance({ provenance, timeZone }: { provenance: ProvenanceView; timeZone: string }) {
  const t = useTranslations('provenance')
  const format = useShopFormat({ timeZone, currency: null })
  const at = (moment: Date) => `${format.day(moment)}, ${format.time(moment)}`
  const rows: readonly (readonly ['received' | 'takenBy' | 'source', string])[] = [
    ['received', at(provenance.takenAt)],
    ['takenBy', t(`takers.${provenance.takenBy}`)],
    ...(provenance.source === null ? [] : [['source', t(`sources.${provenance.source}`)] as const]),
  ]
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-sm">
      {rows.map(([term, value]) => (
        <div key={term} className="contents">
          <dt className="text-muted-foreground">{t(term)}</dt>
          <dd className="wrap-long-words">{value}</dd>
        </div>
      ))}
      <dt className="text-muted-foreground">{t('fingerprint')}</dt>
      <dd>
        <span title={provenance.sha256} aria-label={t('fingerprintLabel', { seal: shortSeal(provenance.sha256) })} className="figures">
          {shortSeal(provenance.sha256)}
        </span>
      </dd>
      <dt className="text-muted-foreground">{t('sealed')}</dt>
      <dd>{provenance.sealedAt === null ? t('notSealed') : at(provenance.sealedAt)}</dd>
    </dl>
  )
}
