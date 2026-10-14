import { ArrowRight, Link2, Users } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId } from 'react'
import { Link } from '@/i18n/navigation'
import { routes } from '@/lib/routes'

// Two kinds of visitor reach these pages by mistake. Each is told where they belong.
export function AccountNotes() {
  const t = useTranslations('auth.notes')
  const titleId = useId()

  return (
    <section aria-labelledby={titleId} className="border-t border-t-foreground pt-4">
      <h2 id={titleId} className="label text-muted-foreground">
        {t('title')}
      </h2>
      <dl>
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 border-b py-4">
          <Users aria-hidden="true" className="mt-0.5 size-5 text-primary" />
          <dt className="font-bold">{t('staff.title')}</dt>
          <dd className="col-start-2 mt-0.5 text-muted-foreground">{t('staff.body')}</dd>
        </div>
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 pt-4">
          <Link2 aria-hidden="true" className="mt-0.5 size-5 text-primary" />
          <dt className="font-bold">{t('renter.title')}</dt>
          <dd className="col-start-2 mt-0.5 text-muted-foreground">
            {t('renter.body')}
            <Link href={routes.forRenters} className="flex min-h-11 items-center gap-1.5 font-semibold text-foreground underline underline-offset-4">
              {t('renter.action')}
              <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
            </Link>
          </dd>
        </div>
      </dl>
    </section>
  )
}
