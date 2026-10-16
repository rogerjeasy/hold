import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { checkPhotoQuality, checkRegion, CONDITION_REPLY_HOURS, conditionReplyOpen, manifestText, missingViews, PHOTO_QUALITY } from './capture-session.ts'

const PLAN = [
  { key: 'left-side', required: true },
  { key: 'right-side', required: true },
  { key: 'battery', required: false },
]

describe('which views a session still needs', () => {
  it('names the required views not yet photographed, in the plan’s order', () => {
    expect(missingViews(PLAN, [])).toEqual(['left-side', 'right-side'])
    expect(missingViews(PLAN, ['right-side', 'battery'])).toEqual(['left-side'])
    expect(missingViews(PLAN, ['left-side', 'right-side'])).toEqual([])
  })
})

describe('the verdict on a photograph before it uploads', () => {
  const good = { sharpness: PHOTO_QUALITY.minSharpness + 1, shadows: 20, highlights: 200, filled: 0.6 }

  it('accepts a sharp, well lit photograph the item fills', () => {
    expect(checkPhotoQuality(good)).toEqual([])
  })

  it('asks for a retake of a blurred, dark, washed-out or nearly empty photograph, and says why', () => {
    expect(checkPhotoQuality({ ...good, sharpness: PHOTO_QUALITY.minSharpness - 1 })).toEqual(['blurred'])
    expect(checkPhotoQuality({ ...good, highlights: PHOTO_QUALITY.minHighlights - 1 })).toEqual(['too_dark'])
    expect(checkPhotoQuality({ ...good, shadows: PHOTO_QUALITY.maxShadows + 1 })).toEqual(['too_bright'])
  })

  it('accepts an item lit against a dark or a white backdrop, which a mean brightness would refuse', () => {
    expect(checkPhotoQuality({ ...good, shadows: 0, highlights: 240 })).toEqual([])
    expect(checkPhotoQuality({ ...good, shadows: 90, highlights: 255 })).toEqual([])
    expect(checkPhotoQuality({ ...good, filled: PHOTO_QUALITY.minFilled - 0.01 })).toEqual(['badly_framed'])
  })
})

describe('a region on a photograph', () => {
  it('is a box inside the photograph, as fractions of its size, large enough to see', () => {
    expect(checkRegion({ x: 0.1, y: 0.2, width: 0.3, height: 0.3 })).toBe(true)
    expect(checkRegion({ x: 0.8, y: 0.2, width: 0.3, height: 0.3 })).toBe(false)
    expect(checkRegion({ x: 0.1, y: 0.2, width: 0.001, height: 0.3 })).toBe(false)
    expect(checkRegion({ x: -0.1, y: 0.2, width: 0.3, height: 0.3 })).toBe(false)
  })

  it('never accepts a box that leaves the photograph', () => {
    fc.assert(
      fc.property(fc.double({ min: -1, max: 2, noNaN: true }), fc.double({ min: -1, max: 2, noNaN: true }), fc.double({ min: 0, max: 2, noNaN: true }), fc.double({ min: 0, max: 2, noNaN: true }), (x, y, width, height) => {
        if (checkRegion({ x, y, width, height })) {
          expect(x).toBeGreaterThanOrEqual(0)
          expect(y).toBeGreaterThanOrEqual(0)
          expect(x + width).toBeLessThanOrEqual(1)
          expect(y + height).toBeLessThanOrEqual(1)
        }
      }),
    )
  })
})

describe('a sealed session’s manifest', () => {
  const session = {
    sessionId: 's-1',
    itemId: 'i-1',
    kind: 'handover' as const,
    sealedAt: new Date('2026-10-16T10:00:00Z'),
    previousManifestFingerprint: null,
    photos: [
      { view: 'right-side', sha256: 'b'.repeat(64), receivedAt: new Date('2026-10-16T09:59:00Z') },
      { view: 'left-side', sha256: 'a'.repeat(64), receivedAt: new Date('2026-10-16T09:58:00Z') },
    ],
  }

  it('lists every photograph and its fingerprint, and the item’s previous manifest, in one fixed order', () => {
    const text = manifestText(session)
    expect(JSON.parse(text)).toEqual({
      session: 's-1',
      item: 'i-1',
      kind: 'handover',
      sealedAt: '2026-10-16T10:00:00.000Z',
      previous: null,
      photos: [
        { view: 'left-side', sha256: 'a'.repeat(64), receivedAt: '2026-10-16T09:58:00.000Z' },
        { view: 'right-side', sha256: 'b'.repeat(64), receivedAt: '2026-10-16T09:59:00.000Z' },
      ],
    })
    expect(manifestText({ ...session, photos: [...session.photos].reverse() })).toBe(text)
  })

  it('changes when the previous manifest changes, which is what chains an item’s sessions', () => {
    expect(manifestText({ ...session, previousManifestFingerprint: 'c'.repeat(64) })).not.toBe(manifestText(session))
  })
})

describe('the renter’s reply to the condition report', () => {
  it('is open for a day after the handover is sealed', () => {
    const sealedAt = new Date('2026-10-16T10:00:00Z')
    expect(CONDITION_REPLY_HOURS).toBe(24)
    expect(conditionReplyOpen(sealedAt, new Date('2026-10-17T09:59:59Z'))).toBe(true)
    expect(conditionReplyOpen(sealedAt, new Date('2026-10-17T10:00:00Z'))).toBe(false)
  })
})
