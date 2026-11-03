import { useTranslations } from 'next-intl'

export const capabilityKeys = ['hold', 'release', 'capture', 'renewal', 'events', 'fee', 'refund', 'dispute'] as const

export type CapabilityKey = (typeof capabilityKeys)[number]

// What a rental needs, and the PayPal capability that answers it, on one card.
export function CapabilityTable({ rows }: { rows: readonly CapabilityKey[] }) {
  const t = useTranslations('paypal')

  return (
    <>
      <div className="surface overflow-clip">
        <table className="w-full table-fixed text-left">
          <caption className="sr-only">{t('caption')}</caption>
          <thead className="bg-muted/60">
            <tr>
              <th scope="col" className="label px-4 py-3 text-xs text-muted-foreground md:px-6">
                {t('needHeading')}
              </th>
              <th scope="col" className="label px-4 py-3 text-xs text-muted-foreground md:px-6">
                {t('capabilityHeading')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((key) => (
              <tr key={key} className="border-t border-border/70 align-top transition-colors duration-200 hover:bg-muted/40">
                <th scope="row" className="px-4 py-4 text-[1.0625rem] font-medium wrap-long-words md:px-6">
                  {t(`rows.${key}.need`)}
                </th>
                <td className="px-4 py-4 md:px-6">
                  <span className="figures inline-flex max-w-full items-start gap-2 rounded-lg bg-primary/8 px-2.5 py-1 text-[0.875rem] text-foreground wrap-long-words">
                    <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                    <span className="min-w-0">{t(`rows.${key}.capability`)}</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-[0.9375rem] text-muted-foreground">{t('note')}</p>
    </>
  )
}
