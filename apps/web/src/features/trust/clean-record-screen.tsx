import { useLocale, useTranslations } from 'next-intl'
import { Panel } from '@/components/ui/panel'
import { Link } from '@/i18n/navigation'
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
    <div className="mx-auto grid w-full max-w-3xl gap-8 px-4 py-8 md:px-8 md:py-12">
      <header className="grid gap-3">
        <p className="label text-xs text-muted-foreground wrap-long-words">{view.shopName}</p>
        <h1 className="text-page-title text-balance">{t('title')}</h1>
        <p className="max-w-prose text-lead text-pretty text-muted-foreground">{own === undefined ? t('notYet') : t('lead')}</p>
      </header>
      {own === undefined ? null : (
        <>
          <RecordCounts record={own.record} title={t('counts', { months: own.record.windowMonths })} />
          <p className="max-w-prose text-lg text-pretty">
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
      <Link href={`${linkRoutes.renter}/${token}`} className="inline-flex min-h-11 items-center justify-self-start font-semibold underline underline-offset-4">
        {t('back')}
      </Link>
    </div>
  )
}
