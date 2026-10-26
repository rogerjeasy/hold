import { useTranslations } from 'next-intl'
import { Panel } from '@/components/ui/panel'
import { useShopFormat } from '@/hooks/use-shop-format'
import type { CleanRecordCredential } from '@/server/clean-record'

// The renter's record as it leaves Hold (extensions.md section 7.7): a signed credential, as a code to scan and as
// text, reissued each time the page is opened.
export function CredentialCode({ credential, timeZone }: { credential: CleanRecordCredential | undefined; timeZone: string }) {
  const t = useTranslations('trust.record')
  const format = useShopFormat({ timeZone, currency: null })
  return (
    <Panel title={t('credential')}>
      {credential === undefined ? (
        <p className="px-4 py-4 md:px-5">{t('credentialUnavailable')}</p>
      ) : (
        <figure className="grid justify-items-start gap-3 px-4 py-4 md:px-5">
          <p className="max-w-prose text-muted-foreground">{t('credentialLead', { time: format.time(credential.expiresAt) })}</p>
          {/* The SVG is drawn on the server from the check page's address alone (server/qr.ts). */}
          <div role="img" aria-label={t('credentialScan')} className="size-72 max-w-full border bg-white p-2" dangerouslySetInnerHTML={{ __html: credential.qr }} />
          <figcaption className="text-sm text-muted-foreground">{t('credentialText')}</figcaption>
          <p data-testid="credential" className="figures max-w-full text-xs break-all">
            {credential.token}
          </p>
        </figure>
      )}
    </Panel>
  )
}
