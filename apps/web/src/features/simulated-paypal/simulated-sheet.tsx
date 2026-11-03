import { FlaskConical } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

// The frame of every simulated PayPal page: a sheet with a dashed edge in the warning colour and the words that say it
// stands in for PayPal, so it can never pass for PayPal's own page, in a photograph or on a screen.
export function SimulatedSheet({ title, children }: { title: string; children: ReactNode }) {
  const t = useTranslations('simulatedPayPal')
  return (
    <div className="mx-auto grid w-full max-w-md content-start gap-5 px-4 pt-6 pb-16 md:pt-12">
      <div className="grid animate-rise gap-5 rounded-2xl border-2 border-dashed border-warning/45 bg-card p-5 shadow-card md:p-7">
        <div className="grid gap-3">
          <p className="label inline-flex items-center gap-2 justify-self-start rounded-full bg-warning/12 px-3 py-1.5 text-xs text-warning">
            <FlaskConical aria-hidden="true" className="size-4" />
            {t('label')}
          </p>
          <p className="text-sm text-pretty text-muted-foreground">{t('notice')}</p>
        </div>
        <h1 className="text-title text-balance">{title}</h1>
        {children}
      </div>
    </div>
  )
}
