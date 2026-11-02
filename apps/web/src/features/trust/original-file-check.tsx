'use client'

import { sha256Hex } from '@hold/trust/evidence-verify'
import type { VerifiedEvidence } from '@hold/trust/evidence-verify'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useShopFormat } from '@/hooks/use-shop-format'
import { useViewLabel } from './use-view-label'

type Found = { readonly kind: 'match'; readonly text: string } | { readonly kind: 'none' }

// Whether a file is one of the record's original photographs: its SHA-256 is computed here and looked for among the
// fingerprints Hold sealed. The file never leaves the browser.
export function OriginalFileCheck({ evidence, timeZone }: { evidence: VerifiedEvidence; timeZone: string }) {
  const t = useTranslations('trust.verify.evidence')
  const format = useShopFormat({ timeZone, currency: null })
  const viewLabel = useViewLabel()
  const [found, setFound] = useState<Found | null>(null)
  const check = async (file: File) => {
    const sha256 = await sha256Hex(new Uint8Array(await file.arrayBuffer()))
    for (const session of evidence.sessions) {
      const photo = session.photos.find((each) => each.sha256 === sha256)
      if (photo !== undefined) {
        setFound({ kind: 'match', text: t('fileMatch', { view: viewLabel(photo), kind: t(`kinds.${session.kind}`), day: format.day(photo.receivedAt), time: format.time(photo.receivedAt) }) })
        return
      }
    }
    setFound({ kind: 'none' })
  }
  return (
    <div className="grid gap-2">
      <Label htmlFor="original-photo">{t('file')}</Label>
      <Input id="original-photo" type="file" accept="image/*" aria-describedby="original-photo-help" className="min-h-11 max-w-md" onChange={(event) => { const file = event.target.files?.[0]; if (file !== undefined) void check(file) }} />
      <p id="original-photo-help" className="text-sm text-muted-foreground text-pretty">{t('fileHelp')}</p>
      {found === null ? null : <p role="status" className={found.kind === 'match' ? 'font-semibold' : 'text-pretty'}>{found.kind === 'match' ? found.text : t('fileNoMatch')}</p>}
    </div>
  )
}
