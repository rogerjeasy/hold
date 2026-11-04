import type { EvidenceVersion, ReceiptDeliverySummary } from '@hold/db'
import type { ReactNode } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { Panel } from '@/components/ui/panel'
import { RenterHead, RenterPage } from '@/features/renter/renter-page'
import { ShopFrame } from '@/features/shop/shop-frame'
import { Link } from '@/i18n/navigation'
import { RecordBuildForm, RecordDownloadForm } from './record-controls'
import type { RecordAction } from './record-input'

type Props = {
  readonly shopName: string
  readonly rentalId: string
  readonly backHref: string
  readonly token?: string
  readonly versions: readonly EvidenceVersion[]
  readonly receipts: readonly ReceiptDeliverySummary[]
  readonly build: RecordAction
  readonly download: RecordAction
  readonly canBuild?: boolean
}

// The same record for staff and for the renter: staff see it in the shop's frame, the renter in the column every page
// of their link uses.
function RecordFrame({ shopName, title, renter, children }: { shopName: string; title: string; renter: boolean; children: ReactNode }) {
  if (!renter) return <ShopFrame shopName={shopName} title={title}>{children}</ShopFrame>
  return <RenterPage><RenterHead shopName={shopName} title={title} />{children}</RenterPage>
}

export function EvidenceRecordScreen({ shopName, rentalId, backHref, token, versions, receipts, build, download, canBuild = true }: Props) {
  const t = useTranslations('records')
  const format = useFormatter()
  const building = versions.some((version) => version.state === 'building')
  const failed = versions[0]?.state === 'failed'
  const label = (key: string) => t.has(key as Parameters<typeof t>[0]) ? t(key as Parameters<typeof t>[0]) : t('unavailable')
  return <RecordFrame shopName={shopName} title={t('title')} renter={token !== undefined}><div className="grid min-w-0 gap-6">
    <Link href={backHref} referrerPolicy="no-referrer" className="inline-flex min-h-11 items-center justify-self-start font-semibold underline underline-offset-4">{t('back')}</Link>
    <p className="max-w-prose text-pretty">{t('lead')}</p>
    <RecordBuildForm action={build} rentalId={rentalId} token={token} building={building} hasVersions={versions.length > 0} failed={failed} settled={versions.filter((version) => version.state === 'ready' || version.state === 'failed').map((version) => version.id)} canBuild={canBuild} />
    {versions.length === 0 ? <p>{t('empty')}</p> : null}
    {versions.map((version) => <Panel key={version.id} title={t('version', { number: version.version })}>
      <div className="grid min-w-0 gap-4 p-4 md:p-5">
        <p>{t('created')}: <time dateTime={version.createdAt.toISOString()}>{format.dateTime(version.createdAt, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}</time> {t('utc')}</p>
        {version.state === 'building' ? <p role="status">{t('building')}</p> : version.state === 'failed' ? <p role="alert" className="text-destructive">{t('buildFailed')}</p> : version.state === 'ready' ? <>
          <p className="font-semibold">{t('ready')}</p>
          <dl className="grid min-w-0 gap-2 text-sm"><dt className="font-semibold">{t('pdfHash')}</dt><dd className="min-w-0 rounded-lg bg-muted/60 px-2.5 py-1.5 font-mono text-xs break-all">{version.pdfSha256 ?? t('unavailable')}</dd><dt className="font-semibold">{t('manifestHash')}</dt><dd className="min-w-0 rounded-lg bg-muted/60 px-2.5 py-1.5 font-mono text-xs break-all">{version.manifestFingerprint}</dd></dl>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">{(['pdf', 'manifest'] as const).map((kind) => <RecordDownloadForm key={kind} action={download} rentalId={rentalId} token={token} packId={version.id} kind={kind} />)}</div>
        </> : <p>{t('unavailable')}</p>}
      </div>
    </Panel>)}
    <Panel title={t('receiptsTitle')}><div className="grid gap-4 p-4 md:p-5">{receipts.length === 0 ? <p>{t('receiptsEmpty')}</p> : <ul className="grid gap-4">{receipts.map((receipt) => {
      const version = versions.find((each) => each.id === receipt.packId)
      return <li key={receipt.id} className="grid min-w-0 gap-1 border-b border-border/70 pb-3 wrap-long-words last:border-b-0 last:pb-0"><p className="font-semibold">{label(`receiptKinds.${receipt.kind}`)}</p><p>{label(`receiptStates.${receipt.status}`)}</p><p>{version === undefined ? t('unavailableVersion') : t('version', { number: version.version })}</p></li>
    })}</ul>}</div></Panel>
  </div></RecordFrame>
}
