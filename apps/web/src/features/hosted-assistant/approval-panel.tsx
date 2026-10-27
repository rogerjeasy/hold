import { ExternalLink } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'

// PayPal's link to approve the rental fee, as Hold's server returned it, never as the model wrote it. The person
// approves in PayPal's own page, on this device or by scanning the code with their phone.
export function ApprovalPanel({ url, qr }: { url: string; qr: string | null }) {
  const t = useTranslations('hostedAssistant')
  return (
    <Panel title={t('approveTitle')}>
      <div className="grid justify-items-start gap-3 px-4 py-3 md:px-5">
        <p className="max-w-prose text-pretty">{t('approveBody')}</p>
        <Button asChild className="min-h-12">
          <a href={url} target="_blank" rel="noreferrer noopener">
            {t('approve')}
            <ExternalLink aria-hidden="true" />
          </a>
        </Button>
        {/* The SVG is drawn on the server from the link alone (server/qr.ts). */}
        {qr === null ? null : <div role="img" aria-label={t('scan')} className="size-48 max-w-full border bg-white p-2" dangerouslySetInnerHTML={{ __html: qr }} />}
      </div>
    </Panel>
  )
}
