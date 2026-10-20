// Where photographs are kept (architecture.md sections 9.2 and 9.3). An original goes straight from the phone to the
// locked evidence bucket and is never shown; a display copy, smaller and with faces blurred, is what people see.

export type UploadLink = {
  readonly url: string
  // Headers the phone must send with the PUT. The checksum is signed, so a corrupted or different file is refused.
  readonly headers: Readonly<Record<string, string>>
}

export type EvidenceStore = {
  // A short-lived link to put one JPEG at this key, accepted only with this SHA-256 (hex) and size.
  uploadLink(input: { readonly key: string; readonly sha256: string; readonly bytes: number }): Promise<UploadLink>
  // What arrived at a key, as the store computed it. Undefined when nothing did.
  stored(key: string): Promise<{ readonly sha256: string; readonly bytes: number } | undefined>
  // The original, for the worker that makes its display copy.
  read(key: string): Promise<Buffer>
  // Face-blurred display bytes only. A missing copy must never fall back to the original.
  readDisplay(key: string): Promise<Buffer | undefined>
  putDisplay(key: string, body: Buffer): Promise<void>
  // A short-lived link to a display copy.
  displayLink(key: string): Promise<string>
}

// How long a link to put or see a photograph lasts.
export const LINK_SECONDS = 300
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024
