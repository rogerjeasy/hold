// Reads a request's body up to a limit. A body over it is refused as soon as the limit is passed, so a public route
// never holds more than the limit in memory, whatever a sender claims or sends.
export async function readCappedBytes(request: Request, maxBytes: number): Promise<{ readonly ok: true; readonly bytes: Buffer } | { readonly ok: false }> {
  const stated = Number(request.headers.get('content-length') ?? '0')
  if (stated > maxBytes) return { ok: false }
  if (request.body === null) return { ok: true, bytes: Buffer.alloc(0) }
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel()
      return { ok: false }
    }
    chunks.push(value)
  }
  return { ok: true, bytes: Buffer.concat(chunks) }
}

export async function readCappedBody(request: Request, maxBytes: number): Promise<{ readonly ok: true; readonly text: string } | { readonly ok: false }> {
  const read = await readCappedBytes(request, maxBytes)
  return read.ok ? { ok: true, text: new TextDecoder().decode(read.bytes) } : read
}
