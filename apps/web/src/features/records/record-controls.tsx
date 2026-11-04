'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { useLookAgain } from '@/hooks/use-look-again'
import type { RecordAction, RecordActionResult } from './record-input'

type Identity = { readonly rentalId: string; readonly token?: string }

function IdentityFields({ rentalId, token }: Identity) {
  const locale = useLocale()
  return <><input type="hidden" name="locale" value={locale} />{token === undefined ? <input type="hidden" name="rentalId" value={rentalId} /> : <input type="hidden" name="token" value={token} />}</>
}

// settled: the versions the server shows ready or failed. A requested version is waited for until it is one of them.
export function RecordBuildForm({ action, rentalId, token, building, hasVersions, failed, settled, canBuild = true }: Identity & { action: RecordAction; building: boolean; hasVersions: boolean; failed: boolean; settled: readonly string[]; canBuild?: boolean }) {
  const t = useTranslations('records')
  const [result, submit, pending] = useActionState<RecordActionResult | null, FormData>(action, null)
  const waiting = result?.ok === true && (result.value.packId === undefined || !settled.includes(result.value.packId))
  useLookAgain(building || waiting, { forMs: 180000 })
  if (!canBuild) return null
  return <form action={submit} className="grid min-w-0 gap-3">
    <IdentityFields rentalId={rentalId} token={token} />
    <Button type="submit" disabled={pending || building} className="w-full whitespace-normal sm:w-auto sm:justify-self-start">{pending ? t('preparing') : failed ? t('retry') : hasVersions ? t('update') : t('prepare')}</Button>
    {result?.ok === false ? <p role="alert" className="text-destructive">{t('requestFailed')}</p> : null}
    {waiting ? <p role="status">{t('requested')}</p> : null}
  </form>
}

export function RecordDownloadForm({ action, rentalId, token, packId, kind }: Identity & { action: RecordAction; packId: string; kind: 'pdf' | 'manifest' }) {
  const t = useTranslations('records')
  const [result, submit, pending] = useActionState<RecordActionResult | null, FormData>(action, null)
  return <form action={submit} className="grid min-w-0 gap-3">
    <IdentityFields rentalId={rentalId} token={token} />
    <input type="hidden" name="packId" value={packId} /><input type="hidden" name="kind" value={kind} />
    <Button type="submit" variant="outline" disabled={pending} className="w-full whitespace-normal sm:w-auto sm:justify-self-start">{pending ? t('opening') : t(kind === 'pdf' ? 'downloadPdf' : 'downloadManifest')}</Button>
    {result?.ok === false || (result?.ok === true && result.value.url === undefined) ? <p role="alert" className="text-destructive">{t('requestFailed')}</p> : null}
    {result?.ok === true && result.value.url !== undefined ? <a href={result.value.url} download={result.value.filename} referrerPolicy="no-referrer" rel="noreferrer" className="inline-flex min-h-11 min-w-0 items-center font-semibold underline underline-offset-4 wrap-long-words">{t(kind === 'pdf' ? 'savePdf' : 'saveManifest')}</a> : null}
  </form>
}
