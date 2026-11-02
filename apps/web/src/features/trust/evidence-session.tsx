import { shortSeal } from '@hold/domain'
import type { CheckedSession } from '@hold/trust/evidence-verify'
import { CircleAlert, CircleCheck } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useShopFormat } from '@/hooks/use-shop-format'
import { PhotoProvenance } from '@/features/provenance/photo-provenance'
import { useViewLabel } from './use-view-label'

// One sealed session on /verify: its seal as recomputed here, how it links to the record before it, and each of its
// photographs with the same line a renter sees under it.
export function EvidenceSession({ session, timeZone }: { session: CheckedSession; timeZone: string }) {
  const t = useTranslations('trust.verify.evidence')
  const format = useShopFormat({ timeZone, currency: null })
  const viewLabel = useViewLabel()
  const holds = session.seal === 'holds'
  const link = session.link !== 'first' ? t(`links.${session.link}`) : session.previous === null ? t('links.firstEver') : t('links.first', { seal: shortSeal(session.previous) })
  return (
    <section aria-labelledby={`session-${session.fingerprint}`} className="grid min-w-0 gap-4 border bg-card p-4 md:p-5">
      <div className="grid gap-1">
        <h3 id={`session-${session.fingerprint}`} className="text-lg font-bold">{t(`kinds.${session.kind}`)}</h3>
        <p className="text-sm text-muted-foreground">{`${format.day(session.sealedAt)}, ${format.time(session.sealedAt)}`}</p>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{t('seal')}</dt>
        <dd className="grid gap-0.5">
          <span title={session.fingerprint} className="figures">{shortSeal(session.fingerprint)}</span>
          <span className={`flex items-start gap-1.5 font-semibold ${holds ? '' : 'text-destructive'}`}>
            {holds ? <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" /> : <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />}
            {holds ? t('sealHolds') : t('sealBroken')}
          </span>
        </dd>
        <dt className="sr-only">{t('chain')}</dt>
        <dd className="col-span-2 text-pretty">{link}</dd>
      </dl>
      <ul className="grid gap-4 sm:grid-cols-2">
        {session.photos.map((photo) => (
          <li key={photo.view} className="grid min-w-0 content-start gap-2 border-t pt-3">
            <p className="font-semibold wrap-long-words">{viewLabel(photo)}</p>
            <PhotoProvenance provenance={{ takenAt: photo.receivedAt, takenBy: session.takenBy, source: photo.source, sha256: photo.sha256, sealedAt: session.sealedAt }} timeZone={timeZone} />
          </li>
        ))}
      </ul>
    </section>
  )
}
