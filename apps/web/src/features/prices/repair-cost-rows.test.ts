import { describe, expect, it } from 'vitest'
import { repairCostRows } from './repair-cost-rows'

describe('what repairs cost against each price', () => {
  it('gives each costed price its repairs, their average and whether the price covers it, prices below first', () => {
    const rows = repairCostRows([
      { priceEntryId: 'hanger', description: 'Bent rear derailleur hanger', priceCents: 25_00, costsCents: [18_00, 18_00] },
      { priceEntryId: 'scratch', description: 'Scratch on the frame, through the paint', priceCents: 35_00, costsCents: [50_00, 66_80] },
    ])
    expect(rows).toEqual([
      { id: 'scratch', description: 'Scratch on the frame, through the paint', priceCents: 35_00, repairs: 2, averageCents: 58_40, gapCents: -23_40, standing: 'below' },
      { id: 'hanger', description: 'Bent rear derailleur hanger', priceCents: 25_00, repairs: 2, averageCents: 18_00, gapCents: 7_00, standing: 'covers' },
    ])
  })

  it('leaves out a price no repair was costed against', () => {
    expect(repairCostRows([{ priceEntryId: 'x', description: 'Lost lock', priceCents: 45_00, costsCents: [] }])).toEqual([])
  })
})
