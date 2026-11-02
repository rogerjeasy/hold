import type { VerifiedEvidence } from '@hold/trust/evidence-verify'
import { CircleAlert, CircleCheck } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { SampleTag } from '@/components/ui/sample-tag'
import { useShopFormat } from '@/hooks/use-shop-format'
import { EvidenceSession } from './evidence-session'
import { OriginalFileCheck } from './original-file-check'

// What /verify shows of an evidence statement whose signature held (architecture.md section 9.7): whether every seal
// recomputed here matches, the item and shop, the renter's own answer to the handover photographs, each sealed
// session in order, and a place to check an original photograph against the record. Every time is on the shop's clock,
// as the renter saw it, whatever the clock of the device checking it.
export function EvidenceReport({ evidence }: { evidence: VerifiedEvidence }) {
  const t = useTranslations('trust.verify.evidence')
  const { timeZone } = evidence
  const format = useShopFormat({ timeZone, currency: null })
  const signed = { day: format.day(evidence.issuedAt), time: format.time(evidence.issuedAt) }
  const confirmed = evidence.confirmed
  return (
    <div className="grid gap-6">
      <p role="status" className={`flex items-start gap-2 text-lg font-semibold text-pretty ${evidence.intact ? '' : 'text-destructive'}`}>
        {evidence.intact ? <CircleCheck aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" /> : <CircleAlert aria-hidden="true" className="mt-1 size-5 shrink-0" />}
        {evidence.intact ? t('intact', signed) : t('broken', signed)}
      </p>
      {evidence.simulated ? (
        <p className="flex flex-wrap items-center gap-2">
          <SampleTag />
          <span>{t('simulated')}</span>
        </p>
      ) : null}
      <div className="grid gap-2">
        <h2 className="text-xl font-extrabold tracking-tight wrap-long-words">{t('heading', { item: evidence.item, shop: evidence.shop })}</h2>
        <p className="text-sm text-muted-foreground">{t('zone', { zone: timeZone })}</p>
        <p className="text-pretty">{confirmed === null ? t('notAnswered') : t(confirmed.reply === 'confirmed' ? 'confirmed' : 'added', { day: format.day(confirmed.at), time: format.time(confirmed.at) })}</p>
      </div>
      {evidence.sessions.map((session) => (
        <EvidenceSession key={session.fingerprint} session={session} timeZone={timeZone} />
      ))}
      <OriginalFileCheck evidence={evidence} timeZone={timeZone} />
    </div>
  )
}
