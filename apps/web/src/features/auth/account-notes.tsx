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
    <section aria-labelledby={titleId} className="rounded-2xl border border-border/70 p-5">
      <h2 id={titleId} className="label text-xs text-muted-foreground">
        {t('title')}
      </h2>
      <dl className="mt-1">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 border-b border-border/70 py-4">
          <span aria-hidden="true" className="row-span-2 grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
            <Users className="size-4.5" />
          </span>
          <dt className="font-bold">{t('staff.title')}</dt>
          <dd className="col-start-2 mt-0.5 text-[0.9375rem] text-muted-foreground">{t('staff.body')}</dd>
        </div>
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 pt-4">
          <span aria-hidden="true" className="row-span-2 grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
            <Link2 className="size-4.5" />
          </span>
          <dt className="font-bold">{t('renter.title')}</dt>
          <dd className="col-start-2 mt-0.5 text-[0.9375rem] text-muted-foreground">
            {t('renter.body')}
            <Link href={routes.forRenters} className="group flex min-h-11 items-center gap-1.5 font-semibold text-foreground underline decoration-primary/50 decoration-2 underline-offset-4 hover:decoration-primary">
              {t('renter.action')}
              <ArrowRight aria-hidden="true" className="size-4 shrink-0 transition-transform duration-300 ease-spring group-hover:translate-x-0.5" />
            </Link>
          </dd>
        </div>
      </dl>
    </section>
  )
}
