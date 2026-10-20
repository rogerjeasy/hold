import { createHash } from 'node:crypto'
import { manifestText } from '@hold/domain'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { rentalDetail } from './booking-repository.ts'
import { addMark, captureSession, conditionReport, confirmMarks, photoForDisplay, recordDisplayCopy, recordPhoto, rentalHandovers, replyToCondition, sealSession, startCaptureSession } from './capture-repository.ts'
import { items, outbox, photos } from './schema/index.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'
import { readyRentalShop } from './testing/ready-rental.ts'
import type { ReadyRentalShop } from './testing/ready-rental.ts'

const NOW = new Date('2026-10-16T09:00:00Z')
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000)
const sha = (text: string) => createHash('sha256').update(text).digest('hex')
const QUALITY = { sharpness: 120, shadows: 20, highlights: 220, filled: 0.6 }

let database: TestDatabase
let shop: ReadyRentalShop
let other: ReadyRentalShop

// True when the database refused the work for want of a grant. The query library wraps the database's own error.
async function denied(work: Promise<unknown>): Promise<boolean> {
  try {
    await work
    return false
  } catch (error) {
    return /permission denied/.test(String(error instanceof Error ? error.cause : error))
  }
}

const photo = (view: string, tag = view) => ({ view, evidenceKey: `evidence/${tag}-${String(Math.random()).slice(2)}.jpg`, sha256: sha(tag), quality: QUALITY })

// A handover started on the first item of a new ready rental.
async function handover(itemCount = 1) {
  const rental = await shop.readyRental(itemCount)
  const started = await shop.act((transaction) => startCaptureSession(transaction, { rentalId: rental.rentalId, rentalItemId: rental.rentalItemIds[0] ?? '', kind: 'handover', actorUserId: shop.scope.userId ?? null }, NOW))
  if (!started.ok) throw new Error(started.reason)
  return { ...rental, sessionId: started.sessionId }
}

async function photographed(sessionId: string, views = ['left-side', 'right-side']) {
  for (const view of views) {
    const recorded = await shop.act((transaction) => recordPhoto(transaction, sessionId, photo(view), NOW))
    if (!recorded.ok) throw new Error(recorded.reason)
  }
}

beforeAll(async () => {
  database = await createTestDatabase()
  shop = await readyRentalShop(database, 'capture', NOW)
  other = await readyRentalShop(database, 'other-capture', NOW)
})

describe('starting a handover', () => {
  it('starts one session for an item of a rental ready for handover, with its type’s photo plan, and gives the same one again', async () => {
    const { rentalId, rentalItemIds, sessionId } = await handover()
    const again = await shop.act((transaction) => startCaptureSession(transaction, { rentalId, rentalItemId: rentalItemIds[0] ?? '', kind: 'handover', actorUserId: null }, NOW))
    expect(again).toEqual({ ok: true, sessionId })
    const session = await shop.act((transaction) => captureSession(transaction, sessionId))
    expect(session?.plan.map((view) => [view.key, view.required])).toEqual([
      ['left-side', true],
      ['right-side', true],
      ['battery', false],
    ])
    expect(session).toMatchObject({ kind: 'handover', rentalId, itemLabel: 'City e-bike 1', missing: ['left-side', 'right-side'], sealedAt: null })
  })

  it('refuses a return before the item has been handed over', async () => {
    const { rentalId, rentalItemIds } = await handover()
    expect(await shop.act((transaction) => startCaptureSession(transaction, { rentalId, rentalItemId: rentalItemIds[0] ?? '', kind: 'return', actorUserId: null }, NOW))).toEqual({ ok: false, reason: 'not_ready' })
  })

  it('finds nothing in another shop', async () => {
    const { rentalId, rentalItemIds } = await shop.readyRental()
    expect(await other.act((transaction) => startCaptureSession(transaction, { rentalId, rentalItemId: rentalItemIds[0] ?? '', kind: 'handover', actorUserId: null }, NOW))).toEqual({ ok: false, reason: 'not_found' })
  })
})

describe('photographing a view', () => {
  it('records the photograph at the server’s time and queues its display copy', async () => {
    const { sessionId } = await handover()
    const recorded = await shop.act((transaction) => recordPhoto(transaction, sessionId, photo('left-side'), later(3)))
    if (!recorded.ok) throw new Error(recorded.reason)
    const session = await shop.act((transaction) => captureSession(transaction, sessionId))
    expect(session?.photos).toMatchObject([{ id: recorded.photoId, view: 'left-side', displayKey: null, receivedAt: later(3) }])
    expect(session?.missing).toEqual(['right-side'])
    const queued = (await database.select().from(outbox)).filter((row) => row.queue === 'media' && row.payload['photoId'] === recorded.photoId)
    expect(queued).toHaveLength(1)
  })

  it('takes a retake as the view’s photograph, and keeps the earlier one on record', async () => {
    const { sessionId } = await handover()
    await shop.act((transaction) => recordPhoto(transaction, sessionId, photo('left-side', 'first'), NOW))
    await shop.act((transaction) => recordPhoto(transaction, sessionId, photo('left-side', 'retake'), later(1)))
    const session = await shop.act((transaction) => captureSession(transaction, sessionId))
    expect(session?.photos.map((each) => each.view)).toEqual(['left-side'])
    const rows = await database.select().from(photos).where(eq(photos.sessionId, sessionId))
    expect(rows.map((row) => [row.sha256, row.supersededAt === null])).toEqual([
      [sha('first'), false],
      [sha('retake'), true],
    ])
  })

  it('can never have its fingerprint or its stored original changed, by any service', async () => {
    const { sessionId } = await handover()
    const recorded = await shop.act((transaction) => recordPhoto(transaction, sessionId, photo('left-side'), NOW))
    if (!recorded.ok) throw new Error(recorded.reason)
    expect(await denied(shop.act((transaction) => transaction.update(photos).set({ sha256: sha('forged') }).where(eq(photos.id, recorded.photoId))))).toBe(true)
    expect(await denied(shop.act((transaction) => transaction.update(photos).set({ evidenceKey: 'evidence/other.jpg' }).where(eq(photos.id, recorded.photoId))))).toBe(true)
  })

  it('takes its display copy once, and shows it from then on', async () => {
    const { sessionId } = await handover()
    const recorded = await shop.act((transaction) => recordPhoto(transaction, sessionId, photo('left-side'), NOW))
    if (!recorded.ok) throw new Error(recorded.reason)
    const waiting = await shop.act((transaction) => photoForDisplay(transaction, recorded.photoId))
    expect(waiting).toMatchObject({ displayKey: null })
    expect(await shop.act((transaction) => recordDisplayCopy(transaction, recorded.photoId, `display/${waiting?.evidenceKey ?? ''}`, 'f00dfeedc0ffee00'))).toBe(true)
    expect(await shop.act((transaction) => recordDisplayCopy(transaction, recorded.photoId, 'display/other.jpg', '0000000000000000'))).toBe(false)
    const [row] = await database.select().from(photos).where(eq(photos.id, recorded.photoId))
    expect(row).toMatchObject({ displayKey: `display/${waiting?.evidenceKey ?? ''}`, perceptualHash: 'f00dfeedc0ffee00' })
  })

  it('refuses a view the plan does not have', async () => {
    const { sessionId } = await handover()
    expect(await shop.act((transaction) => recordPhoto(transaction, sessionId, photo('saddle'), NOW))).toEqual({ ok: false, reason: 'unknown_view' })
  })
})

describe('the item’s marks at handover', () => {
  it('adds a mark drawn on a view, and refuses a box outside the photograph', async () => {
    const { sessionId } = await handover()
    const added = await shop.act((transaction) => addMark(transaction, sessionId, { view: 'left-side', region: { x: 0.1, y: 0.2, width: 0.2, height: 0.1 }, description: 'Scuff on the chain stay' }))
    expect(added).toMatchObject({ ok: true })
    expect(await shop.act((transaction) => addMark(transaction, sessionId, { view: 'left-side', region: { x: 0.9, y: 0.2, width: 0.2, height: 0.1 }, description: 'Off the edge' }))).toEqual({ ok: false, reason: 'region_invalid' })
    const session = await shop.act((transaction) => captureSession(transaction, sessionId))
    expect(session?.marks).toMatchObject([{ view: 'left-side', description: 'Scuff on the chain stay', confirmed: true, region: { x: 0.1, y: 0.2, width: 0.2, height: 0.1 } }])
  })

  it('shows the item’s known marks from earlier rentals, for staff to confirm', async () => {
    const first = await handover()
    await shop.act((transaction) => addMark(transaction, first.sessionId, { view: 'right-side', region: { x: 0.5, y: 0.5, width: 0.1, height: 0.1 }, description: 'Dent in the mudguard' }))
    await photographed(first.sessionId)
    await shop.act((transaction) => sealSession(transaction, first.sessionId, NOW))

    const { rentalId, rentalItemIds } = await shop.readyRental()
    const next = await shop.act((transaction) => startCaptureSession(transaction, { rentalId, rentalItemId: rentalItemIds[0] ?? '', kind: 'handover', actorUserId: null }, NOW))
    if (!next.ok) throw new Error(next.reason)
    const before = await shop.act((transaction) => captureSession(transaction, next.sessionId))
    const known = before?.marks.find((mark) => mark.description === 'Dent in the mudguard')
    expect(known?.confirmed).toBe(false)
    expect(await shop.act((transaction) => confirmMarks(transaction, next.sessionId, [known?.id ?? '']))).toEqual({ ok: true })
    const after = await shop.act((transaction) => captureSession(transaction, next.sessionId))
    expect(after?.marks.find((mark) => mark.id === known?.id)?.confirmed).toBe(true)
  })
})

describe('a rental’s handovers', () => {
  it('lists each item with its handover, started or sealed, for staff to start or continue', async () => {
    const { rentalId, sessionId, itemIds } = await handover(2)
    await photographed(sessionId)
    await shop.act((transaction) => sealSession(transaction, sessionId, NOW))
    const listed = await shop.act((transaction) => rentalHandovers(transaction, rentalId))
    expect(listed).toEqual([
      { itemId: itemIds[0], label: expect.any(String) as string, sessionId, sealed: true },
      { itemId: itemIds[1], label: expect.any(String) as string, sessionId: null, sealed: false },
    ])
  })
})

describe('sealing a handover', () => {
  it('is refused while a required view is missing', async () => {
    const { sessionId } = await handover()
    await photographed(sessionId, ['left-side'])
    expect(await shop.act((transaction) => sealSession(transaction, sessionId, NOW))).toEqual({ ok: false, reason: 'views_missing', views: ['right-side'] })
  })

  it('writes the manifest, chains it to the item’s previous one, and hands the rental over', async () => {
    const { rentalId, itemIds, sessionId } = await handover()
    const [item] = await database.select({ head: items.chainHeadFingerprint }).from(items).where(eq(items.id, itemIds[0] ?? ''))
    await photographed(sessionId)
    const sealed = await shop.act((transaction) => sealSession(transaction, sessionId, later(10)))
    if (!sealed.ok) throw new Error(sealed.reason)
    const session = await shop.act((transaction) => captureSession(transaction, sessionId))
    const expected = manifestText({
      sessionId,
      itemId: itemIds[0] ?? '',
      kind: 'handover',
      sealedAt: later(10),
      previousManifestFingerprint: item?.head ?? null,
      photos: (session?.photos ?? []).map((each) => ({ view: each.view, sha256: sha(each.view), receivedAt: each.receivedAt })),
    })
    expect(sealed).toEqual({ ok: true, manifestFingerprint: sha(expected), rentalOut: true })
    expect((await database.select({ head: items.chainHeadFingerprint }).from(items).where(eq(items.id, itemIds[0] ?? '')))[0]?.head).toBe(sha(expected))
    expect((await shop.act((transaction) => rentalDetail(transaction, rentalId, NOW)))?.state).toBe('out')
    expect(await shop.act((transaction) => sealSession(transaction, sessionId, later(20)))).toEqual({ ok: true, manifestFingerprint: sha(expected), rentalOut: true })
    expect(await shop.act((transaction) => recordPhoto(transaction, sessionId, photo('battery'), NOW))).toEqual({ ok: false, reason: 'sealed' })
  })

  it('hands a rental of two items over only once both are sealed', async () => {
    const { rentalId, rentalItemIds, sessionId } = await handover(2)
    await photographed(sessionId)
    expect(await shop.act((transaction) => sealSession(transaction, sessionId, NOW))).toMatchObject({ ok: true, rentalOut: false })
    expect((await shop.act((transaction) => rentalDetail(transaction, rentalId, NOW)))?.state).toBe('ready')
    const second = await shop.act((transaction) => startCaptureSession(transaction, { rentalId, rentalItemId: rentalItemIds[1] ?? '', kind: 'handover', actorUserId: null }, NOW))
    if (!second.ok) throw new Error(second.reason)
    await photographed(second.sessionId)
    expect(await shop.act((transaction) => sealSession(transaction, second.sessionId, NOW))).toMatchObject({ ok: true, rentalOut: true })
  })
})

describe('the renter’s condition report', () => {
  async function handedOver() {
    const started = await handover()
    await shop.act((transaction) => addMark(transaction, started.sessionId, { view: 'left-side', region: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 }, description: 'Scratch on the frame' }))
    await photographed(started.sessionId)
    await shop.act((transaction) => sealSession(transaction, started.sessionId, NOW))
    return started
  }

  it('shows each item’s photographs and marks, open for a day', async () => {
    const { rentalId } = await handedOver()
    const report = await shop.act((transaction) => conditionReport(transaction, rentalId, later(60)))
    expect(report).toMatchObject({ open: true, reply: null, closesAt: later(24 * 60) })
    expect(report?.items[0]).toMatchObject({ label: 'City e-bike 1', photos: [{ view: 'left-side' }, { view: 'right-side' }], marks: [{ description: 'Scratch on the frame' }] })
  })

  it('takes the renter’s confirmation once, while it is open', async () => {
    const { rentalId } = await handedOver()
    expect(await shop.act((transaction) => replyToCondition(transaction, rentalId, { kind: 'confirmed' }, later(5)))).toEqual({ ok: true })
    expect(await shop.act((transaction) => replyToCondition(transaction, rentalId, { kind: 'confirmed' }, later(6)))).toEqual({ ok: false, reason: 'already_replied' })
    expect((await shop.act((transaction) => conditionReport(transaction, rentalId, later(7))))?.reply).toBe('confirmed')
  })

  it('is closed a day after the handover', async () => {
    const { rentalId } = await handedOver()
    expect(await shop.act((transaction) => replyToCondition(transaction, rentalId, { kind: 'confirmed' }, later(24 * 60)))).toEqual({ ok: false, reason: 'closed' })
  })

  it('lets the renter add photographs of anything missed, chained after the handover', async () => {
    const { rentalId, rentalItemIds, itemIds } = await handedOver()
    const started = await shop.act((transaction) => startCaptureSession(transaction, { rentalId, rentalItemId: rentalItemIds[0] ?? '', kind: 'condition', actorUserId: null }, later(5)))
    if (!started.ok) throw new Error(started.reason)
    expect(await shop.act((transaction) => recordPhoto(transaction, started.sessionId, photo('missed-1'), later(6)))).toMatchObject({ ok: true })
    const [before] = await database.select({ head: items.chainHeadFingerprint }).from(items).where(eq(items.id, itemIds[0] ?? ''))
    const sealed = await shop.act((transaction) => sealSession(transaction, started.sessionId, later(7)))
    expect(sealed).toMatchObject({ ok: true })
    expect(await shop.act((transaction) => replyToCondition(transaction, rentalId, { kind: 'added' }, later(8)))).toEqual({ ok: true })
    const session = await shop.act((transaction) => captureSession(transaction, started.sessionId))
    expect(session).toMatchObject({ kind: 'condition', previousManifestFingerprint: before?.head })
  })
})
