import { describe, expect, it } from 'vitest'
import { evalPhotoUrl, galleryPhotos } from './eval-photos'

// The gate half's photographs, copied at build time as display copies, so anyone can see each pair the scorecard counts.
describe('the evaluation photographs shown in public', () => {
  it('are every handover and return photograph of the gate half, once each, and nothing of the tuning half', () => {
    const manifest = {
      cases: [
        { half: 'gate', before: 'gate/a-before.jpg', after: 'gate/a-after.jpg' },
        { half: 'gate', before: 'gate/a-before.jpg', after: 'gate/b-after.jpg' },
        { half: 'tuning', before: 'tuning/t-before.jpg', after: 'tuning/t-after.jpg' },
      ],
    }
    expect(galleryPhotos(manifest)).toEqual(['gate/a-before.jpg', 'gate/a-after.jpg', 'gate/b-after.jpg'])
  })

  it('refuses a manifest that names a photograph outside its half', () => {
    expect(() => galleryPhotos({ cases: [{ half: 'gate', before: '../secret.jpg', after: 'gate/a.jpg' }] })).toThrow()
  })

  it('are served under one path, and a path that is already an address is kept as it is', () => {
    expect(evalPhotoUrl('gate/a-before.jpg')).toBe('/eval/gate/a-before.jpg')
    expect(evalPhotoUrl('/images/sample-handover.jpg')).toBe('/images/sample-handover.jpg')
  })
})
