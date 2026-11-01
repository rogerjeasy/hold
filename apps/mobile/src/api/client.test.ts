import { z } from 'zod';
import { createApiClient, readApiBaseUrl } from '@/api';

const rental = z.object({ shopName: z.string() });

type Call = { url: string; init: RequestInit };

// A server that answers every request with one response, and remembers what it was asked.
function serverAnswering(respond: (call: Call) => Promise<Response>) {
  const calls: Call[] = [];
  const fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {} };
    calls.push(call);
    return respond(call);
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

const json = (body: unknown, status = 200) => async () => Response.json(body, { status });

const client = (fetch: typeof globalThis.fetch, timeoutMs = 1_000) =>
  createApiClient({ baseUrl: 'https://hold.example', fetch, timeoutMs, locale: () => 'fr' });

describe('a request to Hold', () => {
  it('returns the value of an answer that matches its schema', async () => {
    const server = serverAnswering(json({ ok: true, value: { shopName: 'Velo Zürich' } }));
    await expect(client(server.fetch).request('renter/rental', rental)).resolves.toEqual({ ok: true, value: { shopName: 'Velo Zürich' } });
    expect(server.calls[0]?.url).toBe('https://hold.example/api/mobile/v1/renter/rental');
  });

  it("carries the bearer, the shop and the phone's language", async () => {
    const server = serverAnswering(json({ ok: true, value: { shopName: 'Velo' } }));
    await client(server.fetch).request('shop/today', rental, { bearer: 'token-1', shopId: 'shop-1' });
    expect(server.calls[0]?.init.headers).toMatchObject({ authorization: 'Bearer token-1', 'x-hold-shop': 'shop-1', 'accept-language': 'fr' });
  });

  it('sends a body as JSON with POST', async () => {
    const server = serverAnswering(json({ ok: true, value: { shopName: 'Velo' } }));
    await client(server.fetch).request('renter/actions/extend', rental, { body: { days: 2 } });
    expect(server.calls[0]?.init).toMatchObject({ method: 'POST', body: '{"days":2}', headers: { 'content-type': 'application/json' } });
  });

  it("passes on Hold's refusal as it came", async () => {
    const server = serverAnswering(json({ ok: false, failure: 'link_invalid' }, 401));
    await expect(client(server.fetch).request('renter/rental', rental)).resolves.toEqual({ ok: false, failure: 'link_invalid' });
  });

  it('keeps the fields a refusal names', async () => {
    const server = serverAnswering(json({ ok: false, failure: 'invalid', fields: ['code'] }, 400));
    await expect(client(server.fetch).request('renter/actions/accept', rental, { body: {} })).resolves.toEqual({ ok: false, failure: 'invalid', fields: ['code'] });
  });

  it('reads an answer it does not recognise as unexpected, never as the value', async () => {
    const server = serverAnswering(json({ ok: true, value: { shopName: 42 } }));
    await expect(client(server.fetch).request('renter/rental', rental)).resolves.toEqual({ ok: false, failure: 'unexpected' });
  });

  it('reads a page that is not JSON as unexpected', async () => {
    const server = serverAnswering(async () => new Response('<html>Bad gateway</html>', { status: 502 }));
    await expect(client(server.fetch).request('renter/rental', rental)).resolves.toEqual({ ok: false, failure: 'unexpected' });
  });

  it('reads a request that never reached Hold as offline', async () => {
    const server = serverAnswering(async () => {
      throw new TypeError('Network request failed');
    });
    await expect(client(server.fetch).request('renter/rental', rental)).resolves.toEqual({ ok: false, failure: 'offline' });
  });

  it('gives up after its time and says so', async () => {
    const server = serverAnswering(
      ({ init }) =>
        new Promise((_, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    );
    await expect(client(server.fetch, 20).request('renter/rental', rental)).resolves.toEqual({ ok: false, failure: 'timeout' });
  });
});

describe("Hold's address", () => {
  it('is read from the build, without a trailing slash', () => {
    expect(readApiBaseUrl('https://hold.example/')).toEqual({ ok: true, value: 'https://hold.example' });
  });

  it('refuses a value that is not a web address', () => {
    expect(readApiBaseUrl(undefined)).toEqual({ ok: false, reason: 'missing' });
    expect(readApiBaseUrl('hold.example')).toEqual({ ok: false, reason: 'invalid' });
    expect(readApiBaseUrl('ftp://hold.example')).toEqual({ ok: false, reason: 'invalid' });
  });
});
