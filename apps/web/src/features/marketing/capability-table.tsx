import { useTranslations } from 'next-intl'

export const capabilityKeys = ['hold', 'release', 'capture', 'renewal', 'events', 'fee', 'refund', 'dispute'] as const

export type CapabilityKey = (typeof capabilityKeys)[number]

export function CapabilityTable({ rows }: { rows: readonly CapabilityKey[] }) {
  const t = useTranslations('paypal')

  return (
    <>
      <table className="w-full table-fixed border-t border-t-foreground text-left">
        <caption className="sr-only">{t('caption')}</caption>
        <thead>
          <tr className="border-b">
            <th scope="col" className="label py-3 pr-4 text-muted-foreground">
              {t('needHeading')}
            </th>
            <th scope="col" className="label py-3 text-muted-foreground">
              {t('capabilityHeading')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((key) => (
            <tr key={key} className="border-b align-top">
              <th scope="row" className="py-4 pr-4 text-[1.0625rem] font-normal wrap-long-words">
                {t(`rows.${key}.need`)}
              </th>
              <td className="figures py-4 text-[0.9375rem] wrap-long-words">{t(`rows.${key}.capability`)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 text-[0.9375rem] text-muted-foreground">{t('note')}</p>
    </>
  )
}
