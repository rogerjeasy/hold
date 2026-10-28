import { SAMPLE_PHOTOS } from '@hold/db'
import type { EvidenceStore } from '@hold/evidence'

// The sample rentals' photographs are the demonstration's own images in public/images, not copies in a shop's bucket
// (architecture.md section 20.3). Only the reserved keys the seed writes are served this way; any other key, however it
// is spelled, goes to the store.
const SAMPLE_PATHS: ReadonlyMap<string, string> = new Map(Object.values(SAMPLE_PHOTOS).map((key) => [key, `/images/${key.slice('sample/'.length)}`]))

export function withSamplePhotos(store: EvidenceStore): EvidenceStore {
  return {
    ...store,
    displayLink: (key) => {
      const path = SAMPLE_PATHS.get(key)
      return path === undefined ? store.displayLink(key) : Promise.resolve(path)
    },
    readDisplay: (key) => (SAMPLE_PATHS.has(key) ? Promise.resolve(undefined) : store.readDisplay(key)),
  }
}
