import { amountText, money } from '@hold/domain'
import { currentPriceList, inShop, priceListVersions, repairCosts } from '@hold/db'
import type { Metadata } from 'next'
import { getMessages, getTranslations } from 'next-intl/server'
import { GridLicence } from '@/components/grid/grid-licence'
import { PricesScreen } from '@/features/prices/prices-screen'
import { repairCostRows } from '@/features/prices/repair-cost-rows'
import type { TermsMessages } from '@/features/prices/terms-preview'
import { routing } from '@/i18n/routing'
import type { Locale } from '@/i18n/routing'
import { passkeyGate } from '@/server/passkey-gate'
import { getServices } from '@/server/services'
import { requireShop } from '@/server/shop-page'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('shop.prices')
  return { title: t('title'), robots: { index: false, follow: false } }
}

// The words a renter reads around the prices, in each language, for the editor's preview. Only these leave the server.
async function previewTerms(): Promise<Record<Locale, TermsMessages>> {
  const entries = await Promise.all(routing.locales.map(async (locale) => {
    const { renter } = await getMessages({ locale })
    return [locale, { prices: renter.prices, pricesLead: renter.pricesLead, wear: renter.wear, wearLead: renter.wearLead }] as const
  }))
  return Object.fromEntries(entries) as Record<Locale, TermsMessages>
}

export default async function Page() {
  const context = await requireShop()
  const { config, database } = await getServices()
  const scope = { role: 'hold_app', shopId: context.shop.id, userId: context.person.userId } as const
  const [loaded, gate, terms] = await Promise.all([
    inShop(database, scope, async (transaction) => ({ current: await currentPriceList(transaction), versions: await priceListVersions(transaction), repairs: (await repairCosts(transaction)).byPrice })),
    passkeyGate(context),
    previewTerms(),
  ])
  const { currency, ownerApprovalThresholdCents } = context.shop
  return (
    <>
      <GridLicence licenceKey={config.gridLicenceKey} />
      <PricesScreen
        shopName={context.shop.name}
        shopId={context.shop.id}
        current={loaded.current}
        versions={loaded.versions}
        fixedCurrency={currency}
        threshold={currency === null || ownerApprovalThresholdCents === null ? '' : amountText(money(ownerApprovalThresholdCents, currency))}
        canPublish={context.role === 'owner' || context.role === 'manager'}
        gate={gate}
        previewTerms={terms}
        repairCosts={repairCostRows(loaded.repairs)}
      />
    </>
  )
}
