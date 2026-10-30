import { priceRepairStanding } from '@hold/domain'

// Each published price a repair was costed against (architecture.md section 9.6): how many repairs, what they cost on
// average and how far the price is above or below that, the prices below first. Hold only shows the gap; a price
// changes when the owner publishes a new list, which renters agree to.

export type RepairCostSource = { readonly priceEntryId: string; readonly description: string; readonly priceCents: number; readonly costsCents: readonly number[] }
export type RepairCostRow = { readonly id: string; readonly description: string; readonly priceCents: number; readonly repairs: number; readonly averageCents: number; readonly gapCents: number; readonly standing: 'covers' | 'below' }

export function repairCostRows(sources: readonly RepairCostSource[]): RepairCostRow[] {
  return sources
    .flatMap((source): RepairCostRow[] => {
      const { repairs, averageCents, standing } = priceRepairStanding(source.priceCents, source.costsCents)
      return averageCents === null || standing === null ? [] : [{ id: source.priceEntryId, description: source.description, priceCents: source.priceCents, repairs, averageCents, gapCents: source.priceCents - averageCents, standing }]
    })
    .sort((first, second) => first.gapCents - second.gapCents)
}
