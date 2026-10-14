import { useTranslations } from 'next-intl'

const rowKeys = ['owner', 'staff', 'business'] as const

// Three columns do not fit a phone, so below the md breakpoint the same rows are shown as cards.
export function BeforeAfterTable() {
  const t = useTranslations('pages.forShops.change')

  return (
    <>
      <table className="hidden w-full table-fixed border-t border-t-foreground text-left md:table">
        <caption className="sr-only">{t('caption')}</caption>
        <thead>
          <tr className="border-b">
            <th scope="col" className="label w-1/5 py-3 pr-6 text-muted-foreground">
              {t('who')}
            </th>
            <th scope="col" className="label py-3 pr-6 text-muted-foreground">
              {t('before')}
            </th>
            <th scope="col" className="label py-3 text-muted-foreground">
              {t('after')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rowKeys.map((key) => (
            <tr key={key} className="border-b align-top">
              <th scope="row" className="py-4 pr-6 text-[1.0625rem] font-bold">
                {t(`rows.${key}.who`)}
              </th>
              <td className="py-4 pr-6 text-muted-foreground">{t(`rows.${key}.before`)}</td>
              <td className="py-4">{t(`rows.${key}.after`)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul role="list" className="grid gap-4 md:hidden">
        {rowKeys.map((key) => (
          <li key={key} className="border bg-card p-4">
            <h3 className="text-xl font-bold tracking-tight">{t(`rows.${key}.who`)}</h3>
            <dl className="mt-3 grid gap-3">
              <div>
                <dt className="label text-muted-foreground">{t('before')}</dt>
                <dd className="mt-1 text-muted-foreground">{t(`rows.${key}.before`)}</dd>
              </div>
              <div>
                <dt className="label text-muted-foreground">{t('after')}</dt>
                <dd className="mt-1">{t(`rows.${key}.after`)}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </>
  )
}
