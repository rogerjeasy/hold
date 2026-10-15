import { bookableTypes, currentPriceList, findPayPalAccount, inShop, shopBySlug } from '@hold/db'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { readPeriod } from '@/components/booking/period'
import { ShopPageScreen } from '@/features/shop-page/shop-page-screen'
import { getServices } from '@/server/services'

export async function generateMetadata({ params }: { params: Promise<{ shop: string }> }): Promise<Metadata> {
  const t = await getTranslations('shopPage')
  const shop = await shopBySlug((await getServices()).database, (await params).shop)
  return { title: shop === undefined ? t('label') : t('title', { shop: shop.name }) }
}

export default async function Page({ params, searchParams }: { params: Promise<{ shop: string }>; searchParams: Promise<{ from?: string | string[]; to?: string | string[] }> }) {
  const { database, config } = await getServices()
  const shop = await shopBySlug(database, (await params).shop)
  if (shop === undefined) notFound()
  const now = new Date()
  const period = readPeriod(await searchParams, shop.timeZone, now)
  // Read inside the shop the address names, with nobody named: only what this page shows.
  const loaded = await inShop(database, { role: 'hold_app', shopId: shop.id }, async (transaction) => ({
    paypal: await findPayPalAccount(transaction, shop.id, config.paypalMode),
    prices: await currentPriceList(transaction),
    types: period.period === undefined ? [] : await bookableTypes(transaction, period.period, now),
    any: (await bookableTypes(transaction, { startsAt: now, endsAt: now }, now)).length > 0,
  }))
  const open = shop.currency !== null && loaded.paypal !== undefined && loaded.prices !== undefined && loaded.any
  return (
    <ShopPageScreen
      shop={{ slug: (await params).shop, name: shop.name, currency: shop.currency ?? 'EUR' }}
      open={open}
      period={period}
      types={loaded.types}
      prices={loaded.prices?.entries ?? []}
      wearPolicy={loaded.prices?.wearPolicy ?? ''}
    />
  )
}
