// @vitest-environment node
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { SAMPLE_PHOTO_SHA256 } from '@hold/domain'
import { expect, it } from 'vitest'

// The server knows a sample by its fingerprint alone, so each must be the fingerprint of the file the app serves.
it('names the fingerprint of each sample photograph the app serves', () => {
  const files = { handover: 'sample-handover.jpg', damage: 'sample-return-damage.jpg', contested: 'sample-return-contested.jpg', dropPoint: 'sample-drop-point.jpg' } as const
  for (const [name, file] of Object.entries(files)) {
    const bytes = readFileSync(new URL(`../../public/images/${file}`, import.meta.url))
    expect(SAMPLE_PHOTO_SHA256[name as keyof typeof files]).toBe(createHash('sha256').update(bytes).digest('hex'))
  }
})
