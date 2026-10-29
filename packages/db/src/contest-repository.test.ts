import { beforeAll, describe, expect, it } from 'vitest'
import { replyToClaim } from './claim-reply-repository.ts'
import { contestRecord, latestContestSummary, recordContestSummary } from './contest-repository.ts'
import { presentedClaim, twoLinePrices } from './testing/presented-claim.ts'
import { readyRentalShop } from './testing/ready-rental.ts'
import type { ReadyRentalShop } from './testing/ready-rental.ts'
import { createTestDatabase } from './testing/test-database.ts'

const NOW = new Date('2026-11-03T10:00:00Z')
const COMMENT = 'The scratch on the frame was already there when I picked it up.'
let shop: ReadyRentalShop
let other: ReadyRentalShop
let prices: { readonly scratch: string; readonly fork: string }

async function contested() {
  const claim = await presentedClaim(shop, prices, shop.scope.userId ?? '', NOW)
  const replied = await shop.act((transaction) => replyToClaim(transaction, claim.rentalId, 'contest', COMMENT, NOW))
  if (!replied.ok) throw new Error(replied.reason)
  return claim
}

beforeAll(async () => {
  const database = await createTestDatabase()
  shop = await readyRentalShop(database, 'contest', NOW)
  other = await readyRentalShop(database, 'other-contest', NOW)
  prices = await twoLinePrices(shop, NOW)
})

describe('what a contest summary is written from', () => {
  it('lays out each claim line with the facts code reads, the renter’s words, and both readers’ languages', async () => {
    const claim = await contested()
    const record = await shop.act((transaction) => contestRecord(transaction, claim.rentalId))
    expect(record).toMatchObject({
      claimId: claim.claimId,
      comment: COMMENT,
      renterPhotos: 0,
      conditionReply: null,
      incidentsReported: 0,
      languages: { shop: 'en', renter: 'en' },
    })
    // Both lines were added at the same moment, so their order is not the point here.
    expect(record?.lines.map((line) => [line.description, line.source, line.addedBy, line.reason]).sort()).toEqual([
      ['Fork scratch', 'person', 'Ana', 'Scratch on the fork.'],
      ['Scratch', 'person', 'Ana', 'Scratch on the frame.'],
    ])
    expect(record?.lines[0]).toMatchObject({ knownMarkNearby: false, bothLooksConfirmed: false })
  })

  it('is nothing for a claim the renter did not contest, or another shop’s', async () => {
    const claim = await presentedClaim(shop, prices, shop.scope.userId ?? '', NOW)
    expect(await shop.act((transaction) => contestRecord(transaction, claim.rentalId))).toBeUndefined()
    const contestedClaim = await contested()
    expect(await other.act((transaction) => contestRecord(transaction, contestedClaim.rentalId))).toBeUndefined()
  })
})

describe('the stored summaries of a contest', () => {
  it('keeps every attempt, and reads back the latest', async () => {
    const claim = await contested()
    expect(await shop.act((transaction) => latestContestSummary(transaction, claim.claimId))).toBeUndefined()
    await shop.act((transaction) => recordContestSummary(transaction, claim.claimId, { outcome: 'unavailable', summary: null, model: 'not_answered', promptVersion: 'contest-1', simulated: false }, NOW))
    const summary = { forShop: { overview: 'The renter disputes the scratch.', lines: [] }, forRenter: { overview: 'You dispute the scratch.', lines: [] } }
    await shop.act((transaction) => recordContestSummary(transaction, claim.claimId, { outcome: 'answered', summary, model: 'model', promptVersion: 'contest-1', simulated: true }, new Date(NOW.getTime() + 1000)))
    expect(await shop.act((transaction) => latestContestSummary(transaction, claim.claimId))).toMatchObject({ outcome: 'answered', summary, simulated: true })
    expect(await other.act((transaction) => latestContestSummary(transaction, claim.claimId))).toBeUndefined()
  })
})
