import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { SAMPLE_PHOTO_SHA256 } from './capture-session.ts'
import { photoSource, photoTakenBy, shortSeal } from './photo-provenance.ts'

const OTHER = 'b'.repeat(64)

describe('where a photograph came from', () => {
  it('keeps what Hold’s capture screen said: the live camera or a chosen file', () => {
    expect(photoSource('camera', OTHER)).toBe('camera')
    expect(photoSource('file', OTHER)).toBe('file')
  })

  it('says nothing when the screen said nothing, as an older phone does', () => {
    expect(photoSource(undefined, OTHER)).toBeNull()
  })

  it('calls the demonstration’s own photographs samples, whatever the screen said', () => {
    for (const sha256 of Object.values(SAMPLE_PHOTO_SHA256)) {
      expect(photoSource('camera', sha256)).toBe('sample')
      expect(photoSource(undefined, sha256)).toBe('sample')
    }
  })
})

describe('who took a photograph', () => {
  it('is the renter for a session the renter photographed through their link', () => {
    expect(photoTakenBy({ kind: 'return', byRenter: true, actorRole: null })).toBe('renter')
  })

  it('is the renter for what they added to the condition report or photographed of an incident', () => {
    expect(photoTakenBy({ kind: 'condition', byRenter: false, actorRole: null })).toBe('renter')
    expect(photoTakenBy({ kind: 'incident', byRenter: false, actorRole: null })).toBe('renter')
  })

  it('is the staff member’s role at the counter', () => {
    expect(photoTakenBy({ kind: 'handover', byRenter: false, actorRole: 'counter_staff' })).toBe('counter_staff')
    expect(photoTakenBy({ kind: 'return', byRenter: false, actorRole: 'owner' })).toBe('owner')
  })

  it('is the shop’s staff when the person no longer has a role there', () => {
    expect(photoTakenBy({ kind: 'handover', byRenter: false, actorRole: null })).toBe('staff')
  })
})

describe('a seal short enough to read aloud', () => {
  it('is the fingerprint’s first sixteen characters in groups of four', () => {
    expect(shortSeal(SAMPLE_PHOTO_SHA256.handover)).toBe('7ac3 9bad b505 d60e')
  })

  it('always begins the full fingerprint, so a person can match it by eye', () => {
    fc.assert(fc.property(fc.stringMatching(/^[0-9a-f]{64}$/), (sha256) => sha256.startsWith(shortSeal(sha256).replaceAll(' ', ''))))
  })
})
