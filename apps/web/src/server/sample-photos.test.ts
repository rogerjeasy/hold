import { SAMPLE_PHOTOS } from '@hold/db'
import type { EvidenceStore } from '@hold/evidence'
import { describe, expect, it } from 'vitest'
import { withSamplePhotos } from './sample-photos'

const store: EvidenceStore = {
  uploadLink: () => Promise.reject(new Error('not used')),
  stored: () => Promise.resolve(undefined),
  read: () => Promise.reject(new Error('not used')),
  readDisplay: (key) => Promise.resolve(Buffer.from(key)),
  putDisplay: () => Promise.resolve(),
  displayLink: (key) => Promise.resolve(`https://display.example/${key}?signed`),
}

// A sample rental's photographs are the demonstration's own images (architecture.md section 20.3), served by the app.
describe('photographs of the sample rentals', () => {
  it('are shown from the app’s own sample images', async () => {
    const photos = withSamplePhotos(store)
    expect(await photos.displayLink(SAMPLE_PHOTOS.handover)).toBe('/images/sample-handover.jpg')
    expect(await photos.displayLink(SAMPLE_PHOTOS.damage)).toBe('/images/sample-return-damage.jpg')
  })

  it('leave every other photograph to the store, including one that only looks like a sample', async () => {
    const photos = withSamplePhotos(store)
    expect(await photos.displayLink('shop/rental/view.jpg')).toBe('https://display.example/shop/rental/view.jpg?signed')
    expect(await photos.displayLink('sample/../../secret.jpg')).toBe('https://display.example/sample/../../secret.jpg?signed')
  })

  it('have no display copy in the store to read', async () => {
    expect(await withSamplePhotos(store).readDisplay(SAMPLE_PHOTOS.damage)).toBeUndefined()
  })
})
