import type { PhotoMeasures } from '@hold/domain'

// One photograph from the phone to the locked evidence store (architecture.md section 9.1): its fingerprint is
// computed here and signed into the upload link, so the store refuses any other file; the upload is tried again on
// weak shop wifi; then the server reads back what arrived and records that.

type Refused = { readonly ok: false; readonly failure: string; readonly reason?: string }
type Answer<Value> = { readonly ok: true; readonly value: Value } | Refused

export type UploadSteps = {
  request(previous: null, data: FormData): Promise<Answer<{ readonly key: string; readonly url: string; readonly headers: Readonly<Record<string, string>> }>>
  // True once the store took the photograph.
  put(url: string, headers: Readonly<Record<string, string>>, blob: Blob, onProgress: (share: number) => void): Promise<boolean>
  confirm(previous: null, data: FormData): Promise<Answer<{ readonly photoId: string }>>
  wait(milliseconds: number): Promise<void>
}

export type UploadRequest = {
  // What names where the photograph goes: staff's session, or a renter's link and item.
  readonly target: Readonly<Record<string, string>>
  readonly view: string
  readonly blob: Blob
  readonly measures: PhotoMeasures
  readonly locale: string
  readonly onProgress?: (share: number) => void
  readonly simulated?: boolean
}

const TRIES = 3

const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('')

function fields(values: Readonly<Record<string, string>>): FormData {
  const data = new FormData()
  for (const [name, value] of Object.entries(values)) data.set(name, value)
  return data
}

const reasonOf = (refused: Refused) => (refused.failure === 'refused' ? (refused.reason ?? 'refused') : refused.failure)

export async function uploadPhoto(request: UploadRequest, steps: UploadSteps): Promise<{ readonly ok: true; readonly photoId: string } | { readonly ok: false; readonly reason: string }> {
  const sha256 = hex(await crypto.subtle.digest('SHA-256', await request.blob.arrayBuffer()))
  const link = await steps.request(null, fields({ ...request.target, view: request.view, sha256, bytes: String(request.blob.size), locale: request.locale }))
  if (!link.ok) return { ok: false, reason: reasonOf(link) }
  let stored = false
  for (let attempt = 1; attempt <= TRIES && !stored; attempt += 1) {
    stored = await steps.put(link.value.url, link.value.headers, request.blob, request.onProgress ?? (() => undefined))
    if (!stored && attempt < TRIES) await steps.wait(attempt * 1000)
  }
  if (!stored) return { ok: false, reason: 'upload_failed' }
  const { sharpness, shadows, highlights, filled } = request.measures
  const measured = { sharpness: String(sharpness), shadows: String(shadows), highlights: String(highlights), filled: String(filled) }
  const confirmed = await steps.confirm(null, fields({ ...request.target, view: request.view, key: link.value.key, ...measured, locale: request.locale, ...(request.simulated === true ? { simulated: 'true' } : {}) }))
  return confirmed.ok ? { ok: true, photoId: confirmed.value.photoId } : { ok: false, reason: reasonOf(confirmed) }
}

export const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
