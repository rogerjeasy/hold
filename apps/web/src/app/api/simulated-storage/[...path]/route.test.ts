// @vitest-environment node
import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

process.env['HOLD_ENVIRONMENT'] = 'test'
process.env['HOLD_COOKIE_KEY'] = Buffer.alloc(32, 9).toString('base64')
vi.mock('next/headers', () => ({ cookies: () => Promise.resolve({ get: () => undefined }), headers: () => Promise.resolve(new Headers()) }))

const { GET, PUT } = await import('./route')
const { getServices } = await import('@/server/services')

const body = Buffer.from('a photograph')
const checksum = createHash('sha256').update(body).digest('base64')
const params = (path: string[]) => ({ params: Promise.resolve({ path }) })

describe('the simulated photograph storage', () => {
  it('stores an original only with its signed fingerprint, and never over another', async () => {
    const put = (content: Buffer, sum: string) => PUT(new Request('https://hold.test/x', { method: 'PUT', body: new Uint8Array(content), headers: { 'x-amz-checksum-sha256': sum } }), params(['evidence', 'shop', 'session', 'left-side', '1.jpg']))
    expect((await put(Buffer.from('another'), checksum)).status).toBe(400)
    expect((await put(body, checksum)).status).toBe(200)
    expect((await put(body, checksum)).status).toBe(409)
    expect(await (await getServices()).simulatedEvidence?.stored('shop/session/left-side/1.jpg')).toEqual({ sha256: createHash('sha256').update(body).digest('hex'), bytes: body.length })
  })

  it('serves display copies, and never an original', async () => {
    await (await getServices()).simulatedEvidence?.putDisplay('shop/session/left-side/1.jpg', Buffer.from('display'))
    const shown = await GET(new Request('https://hold.test/x'), params(['display', 'shop', 'session', 'left-side', '1.jpg']))
    expect(shown.status).toBe(200)
    expect(shown.headers.get('content-type')).toBe('image/jpeg')
    expect((await GET(new Request('https://hold.test/x'), params(['evidence', 'shop', 'session', 'left-side', '1.jpg']))).status).toBe(404)
  })
})
