'use client'
import type { ClaimWorkspace } from '@hold/db'
import { FilePen, ShieldCheck } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { Notice } from '@/components/ui/notice'
import { Panel } from '@/components/ui/panel'
import { CleanReleaseForm } from './claim-controls'
import { ClaimDraftForm } from './claim-draft-form'

// The two ways a returned rental is settled, before any claim: release the hold as clean, or prepare a claim. When the
// comparison found possible new damage, or the renter agreed a line during the rental, the claim leads and the release
// waits behind a second step (audit finding F-M10). decision: wraps what moves money in the passkey prompt when needed.
export function ClaimStart({ data, decision }: { data: ClaimWorkspace; decision: (forms: ReactNode) => ReactNode }) {
  const t = useTranslations('claim')
  const damaged = data.possibleFindings.length > 0 || data.agreedIncidents.length > 0
  const clean = (
    <Panel title={t('cleanTitle')} icon={ShieldCheck}>
      <div className="p-4 md:p-5">{decision(<CleanReleaseForm rentalId={data.rentalId} quiet={damaged} />)}</div>
    </Panel>
  )
  const draft = (
    <Panel title={t('draftTitle')} icon={FilePen}>
      <div className="p-4 md:p-5"><ClaimDraftForm data={data} leading={damaged} /></div>
    </Panel>
  )
  return damaged ? (
    <>
      <Notice tone="warning" title={t('damagedTitle')} body={t('damagedBody')} />
      {draft}
      {clean}
    </>
  ) : (
    <>
      {clean}
      {draft}
    </>
  )
}
