export type FingerprintedPhoto = { readonly sha256: string; readonly perceptualHash: string | null }

// Fingerprints this close mean the same picture saved again: resizing and recompressing moves a fingerprint by one to
// four bits, while a new photograph of the same view moves it further (reuse.test.ts gives the measurements).
export const REUSED_WITHIN_BITS = 4

const FINGERPRINT = /^[0-9a-f]{16}$/

// How many of the 64 bits two fingerprints differ in; unknown fingerprints count as different.
function bitsApart(first: string, second: string): number {
  if (!FINGERPRINT.test(first) || !FINGERPRINT.test(second)) return first === second ? 0 : Number.POSITIVE_INFINITY
  let difference = BigInt(`0x${first}`) ^ BigInt(`0x${second}`)
  let count = 0
  while (difference > 0n) {
    count += Number(difference & 1n)
    difference >>= 1n
  }
  return count
}

// A return photograph that repeats earlier evidence, byte for byte or to the eye, proves nothing about the return.
export function photoReused(photo: FingerprintedPhoto, earlier: readonly FingerprintedPhoto[]): boolean {
  return earlier.some((previous) => previous.sha256 === photo.sha256
    || (photo.perceptualHash !== null && previous.perceptualHash !== null && bitsApart(photo.perceptualHash, previous.perceptualHash) <= REUSED_WITHIN_BITS))
}
