import { useLocale } from 'next-intl'
import { formatMoney, type MoneyStyle } from '@/lib/money'
import { exampleRental } from './example-rental'

export function useExampleMoney(): (cents: number, style?: MoneyStyle) => string {
  const locale = useLocale()
  return (cents, style = 'short') => formatMoney({ cents, currency: exampleRental.currency }, locale, style)
}
