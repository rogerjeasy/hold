'use client'

import { Copy } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

// A renter link as a code to scan with the renter's phone, with its address to read or copy.
export function LinkCode({ url, qr, scan }: { url: string; qr: string; scan: string }) {
  const t = useTranslations('shop.rentals.link')
  const [copied, setCopied] = useState(false)
  return (
    <figure className="grid justify-items-start gap-3">
      {/* The SVG is drawn on the server from the link alone (server/qr.ts). */}
      <div role="img" aria-label={scan} className="size-56 max-w-full border bg-white p-2" dangerouslySetInnerHTML={{ __html: qr }} />
      <figcaption className="text-sm text-muted-foreground">{scan}</figcaption>
      <p data-testid="renter-link" className="figures max-w-full text-sm break-all">
        {url}
      </p>
      <Button
        type="button"
        variant="ghost"
        onClick={() => {
          void navigator.clipboard.writeText(url).then(() => {
            setCopied(true)
          })
        }}
      >
        <Copy aria-hidden="true" />
        {copied ? t('copied') : t('copy')}
      </Button>
    </figure>
  )
}
