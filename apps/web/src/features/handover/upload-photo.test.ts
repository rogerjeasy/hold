import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { uploadPhoto } from './upload-photo'

const bytes = new Uint8Array([255, 216, 1, 2, 3])
const blob = new Blob([bytes], { type: 'image/jpeg' })
const sha = createHash('sha256').update(bytes).digest('hex')
const measures = { sharpness: 120, shadows: 20, highlights: 220, filled: 0.6 }

const linked = { ok: true as const, value: { key: 'shop/session/left-side/1.jpg', url: 'https://store.test/put', headers: { 'x-amz-checksum-sha256': 'c3VtCg==' } } }

describe('uploading a photograph from the phone', () => {
  it('asks for a link with the photograph’s own fingerprint, puts it there, and says it is done', async () => {
    const request = vi.fn(() => Promise.resolve(linked))
    const put = vi.fn(() => Promise.resolve(true))
    const confirm = vi.fn(() => Promise.resolve({ ok: true as const, value: { photoId: 'photo-1', sessionId: 'session-1' } }))
    const progress: number[] = []
    const result = await uploadPhoto({ target: { sessionId: 'session-1' }, view: 'left-side', blob, measures, locale: 'en', onProgress: (share) => progress.push(share) }, { request, put, confirm, wait: () => Promise.resolve() })
    expect(result).toEqual({ ok: true, photoId: 'photo-1' })
    const asked = request.mock.calls[0] as unknown as [null, FormData]
    expect([asked[1].get('sessionId'), asked[1].get('sha256'), asked[1].get('bytes'), asked[1].get('view')]).toEqual(['session-1', sha, String(bytes.length), 'left-side'])
    expect(put).toHaveBeenCalledWith('https://store.test/put', linked.value.headers, blob, expect.any(Function))
    const confirmed = confirm.mock.calls[0] as unknown as [null, FormData]
    expect([confirmed[1].get('key'), confirmed[1].get('sharpness')]).toEqual([linked.value.key, '120'])
  })

  it('tries the upload again on weak wifi, and gives up after three tries', async () => {
    const put = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const confirm = vi.fn(() => Promise.resolve({ ok: true as const, value: { photoId: 'photo-2', sessionId: 'session-1' } }))
    expect(await uploadPhoto({ target: { sessionId: 's' }, view: 'v', blob, measures, locale: 'en' }, { request: () => Promise.resolve(linked), put, confirm, wait: () => Promise.resolve() })).toEqual({ ok: true, photoId: 'photo-2' })
    expect(put).toHaveBeenCalledTimes(2)

    const failing = vi.fn(() => Promise.resolve(false))
    expect(await uploadPhoto({ target: { sessionId: 's' }, view: 'v', blob, measures, locale: 'en' }, { request: () => Promise.resolve(linked), put: failing, confirm, wait: () => Promise.resolve() })).toEqual({ ok: false, reason: 'upload_failed' })
    expect(failing).toHaveBeenCalledTimes(3)
  })

  it('says why the server refused', async () => {
    const refused = { ok: false as const, failure: 'refused' as const, reason: 'sealed' }
    expect(await uploadPhoto({ target: { sessionId: 's' }, view: 'v', blob, measures, locale: 'en' }, { request: () => Promise.resolve(refused), put: vi.fn(), confirm: vi.fn(), wait: () => Promise.resolve() })).toEqual({ ok: false, reason: 'sealed' })
  })
})
