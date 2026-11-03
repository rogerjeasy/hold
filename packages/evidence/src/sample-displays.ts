import { SAMPLE_PHOTOS } from '@hold/db'
import type { EvidenceStore } from './port.ts'

// The sample rentals' photographs are the demonstration's own images, not copies in the display bucket (architecture.md
// section 20.3). A store that builds records reads each reserved sample key from its file instead; any other key, however
// it is spelled, goes to the store. The file is named as the key, without its "sample/" prefix.
const SAMPLE_FILES: ReadonlyMap<string, string> = new Map(Object.values(SAMPLE_PHOTOS).map((key) => [key, key.slice('sample/'.length)]))

export function withSampleDisplays(store: EvidenceStore, readSample: (file: string) => Promise<Buffer>): EvidenceStore {
  return {
    ...store,
    readDisplay: (key) => {
      const file = SAMPLE_FILES.get(key)
      return file === undefined ? store.readDisplay(key) : readSample(file)
    },
  }
}

// The original a comparison reads for a photograph. A seeded sample's original is the demonstration's own image, which
// no evidence bucket holds, so it is read by its reserved display key from a store wrapped as above. Only the seed writes
// a reserved display key; every other photograph is read from the evidence bucket by its own key.
export async function readOriginal(store: EvidenceStore, photo: { readonly evidenceKey: string; readonly displayKey: string | null }): Promise<Buffer> {
  if (photo.displayKey === null || !SAMPLE_FILES.has(photo.displayKey)) return store.read(photo.evidenceKey)
  const body = await store.readDisplay(photo.displayKey)
  if (body === undefined) throw new Error('A sample photograph is not beside this code.')
  return body
}
