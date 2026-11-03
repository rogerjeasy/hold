import { useTranslations } from 'next-intl'

const rowKeys = ['owner', 'staff', 'business'] as const

// Three columns do not fit a phone, so below the md breakpoint the same rows are shown as cards. The column of what
// changes with Hold is set apart by the accent.
export function BeforeAfterTable() {
  const t = useTranslations('pages.forShops.change')

  return (
    <>
      <div className="surface hidden overflow-clip md:block">
        <table className="w-full table-fixed text-left">
          <caption className="sr-only">{t('caption')}</caption>
          <thead className="bg-muted/60">
            <tr>
              <th scope="col" className="label w-1/5 px-6 py-3 text-xs text-muted-foreground">
                {t('who')}
              </th>
              <th scope="col" className="label px-6 py-3 text-xs text-muted-foreground">
                {t('before')}
              </th>
              <th scope="col" className="label bg-primary/6 px-6 py-3 text-xs text-primary">
                {t('after')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rowKeys.map((key) => (
              <tr key={key} className="border-t border-border/70 align-top">
                <th scope="row" className="px-6 py-5 text-[1.0625rem] font-bold">
                  {t(`rows.${key}.who`)}
                </th>
                <td className="px-6 py-5 text-muted-foreground">{t(`rows.${key}.before`)}</td>
                <td className="bg-primary/4 px-6 py-5 font-medium">{t(`rows.${key}.after`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul role="list" className="stagger grid gap-4 md:hidden">
        {rowKeys.map((key) => (
          <li key={key} className="surface overflow-clip">
            <h3 className="px-5 pt-5 text-xl font-bold tracking-tight">{t(`rows.${key}.who`)}</h3>
            <dl className="mt-3 grid">
              <div className="px-5 pb-4">
                <dt className="label text-xs text-muted-foreground">{t('before')}</dt>
                <dd className="mt-1 text-muted-foreground">{t(`rows.${key}.before`)}</dd>
              </div>
              <div className="border-t border-border/70 bg-primary/4 px-5 py-4">
                <dt className="label text-xs text-primary">{t('after')}</dt>
                <dd className="mt-1 font-medium">{t(`rows.${key}.after`)}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </>
  )
}
