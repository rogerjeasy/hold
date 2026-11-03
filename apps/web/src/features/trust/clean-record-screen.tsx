import { useLocale, useTranslations } from 'next-intl'
import { Panel } from '@/components/ui/panel'
import { BackLink, RenterHead, RenterPage } from '@/features/renter/renter-page'
import { formatMoney } from '@/lib/money'
import { linkRoutes } from '@/lib/routes'
import type { CleanRecordView } from '@/server/clean-record'
import { ConsentForm } from './consent-form'
import { CredentialCode } from './credential-code'
import { DeleteRecordForm } from './delete-record-form'
import { RecordCounts } from './record-counts'

export type CleanRecordScreenProps = { token: string; view: CleanRecordView }

// The renter's Clean Record on their rental link (extensions.md section 7.6): the counts, the deposits never taken
// from them, the credential to show, whether other Hold shops may use it, and deleting it.
export function CleanRecordScreen({ token, view }: CleanRecordScreenProps) {
  const t = useTranslations('trust.record')
  const locale = useLocale()
  const { own } = view
  return (
    <RenterPage>
      <RenterHead shopName={view.shopName} title={t('title')} lead={own === undefined ? t('notYet') : t('lead')} />
      {own === undefined ? null : (
        <>
          <RecordCounts record={own.record} title={t('counts', { months: own.record.windowMonths })} />
          <p className="max-w-prose border-l-2 border-success pl-3.5 text-lg text-pretty">
            {own.neverTaken.length === 0
              ? t('neverTakenNone')
              : own.neverTaken.map((each) => t('neverTaken', { amount: formatMoney(each.amount, locale), count: each.rentals })).join(' ')}
          </p>
          <CredentialCode credential={view.credential} timeZone={view.timeZone} />
          <Panel title={t('consentTitle')}>
            <div className="px-4 py-4 md:px-5">
              <ConsentForm token={token} consent={own.consent} />
            </div>
          </Panel>
          <Panel title={t('delete')}>
            <div className="px-4 py-4 md:px-5">
              <DeleteRecordForm token={token} />
            </div>
          </Panel>
        </>
      )}
      <BackLink href={`${linkRoutes.renter}/${token}`}>{t('back')}</BackLink>
    </RenterPage>
  )
}
