export type FingerprintedPhoto = { readonly sha256: string; readonly perceptualHash: string | null }

// A return photograph that repeats earlier evidence, byte for byte or to the eye, proves nothing about the return.
export function photoReused(photo: FingerprintedPhoto, earlier: readonly FingerprintedPhoto[]): boolean {
  return earlier.some((previous) => previous.sha256 === photo.sha256 || (photo.perceptualHash !== null && previous.perceptualHash === photo.perceptualHash))
}
