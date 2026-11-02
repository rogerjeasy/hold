'use client'

import { CircleAlert, LoaderCircle, ShieldCheck } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { checkEvidence } from '@/features/records/renter-actions'

// "Check this evidence": Hold signs what it holds about the item's sealed photographs, and the browser opens /verify,
// which checks the signature and recomputes every seal there, with nothing sent back.
export function CheckEvidence({ token, itemId }: { token: string; itemId: string }) {
  const t = useTranslations('provenance')
  const locale = useLocale()
  const [result, check, checking] = useActionState(checkEvidence, null)
  useEffect(() => {
    if (result?.ok === true) window.location.assign(result.value.url)
  }, [result])
  return (
    <form action={check} className="grid justify-items-start gap-2">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="locale" value={locale} />
      <Button type="submit" variant="outline" className="min-h-11" disabled={checking}>
        {checking ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <ShieldCheck aria-hidden="true" />}
        {t('check')}
      </Button>
      {result === null || result.ok ? null : (
        <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t('checkFailed')}
        </p>
      )}
    </form>
  )
}
