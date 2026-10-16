import { MAX_PHOTO_BYTES } from '@hold/evidence'
import { readCappedBytes } from '@/server/capped-body'
import { getServices } from '@/server/services'

// Stands in for S3 in the test environment only, and answers nothing anywhere else. The phone puts an original here as
// it would into the evidence bucket, refused without its signed fingerprint and never over another; screens read
// display copies from here. An original is never served.

type Params = { params: Promise<{ path: string[] }> }

const answer = (status: number) => new Response(null, { status })

export async function PUT(request: Request, { params }: Params): Promise<Response> {
  const store = (await getServices()).simulatedEvidence
  const [bucket, ...key] = (await params).path
  if (store === undefined || bucket !== 'evidence' || key.length === 0) return answer(404)
  const read = await readCappedBytes(request, MAX_PHOTO_BYTES)
  if (!read.ok) return answer(413)
  const stored = store.receive(key.join('/'), read.bytes, request.headers.get('x-amz-checksum-sha256') ?? '')
  return answer(stored === 'stored' ? 200 : stored === 'exists' ? 409 : 400)
}

export async function GET(_request: Request, { params }: Params): Promise<Response> {
  const store = (await getServices()).simulatedEvidence
  const [bucket, ...key] = (await params).path
  const body = store === undefined || bucket !== 'display' ? undefined : store.displayed(key.join('/'))
  return body === undefined ? answer(404) : new Response(new Uint8Array(body), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=300' } })
}
