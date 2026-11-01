import { todaySchema } from '@hold/mobile-api';
import { staffSession } from '@/storage/staff-session';
import { createFakeApi } from '@/test/fake-api';
import { staffAct, staffRead } from './staff-request';
import { TODAY } from './test-fixtures';

const SHOP = '0b8f4f2e-5f1e-4c1a-9a35-2f7f6f0e8a01';
const NOW = new Date('2026-11-01T09:00:00.000Z');
const clock = () => NOW;

const signedIn = (expiresAt: string) => staffSession.write({ accessToken: 'old-access', refreshToken: 'refresh-1', expiresAt, shopId: SHOP });

describe('a staff request', () => {
  it('carries the access token and the shop', async () => {
    await signedIn('2026-11-01T10:00:00.000Z');
    const api = createFakeApi({ 'shop/today': { ok: true, value: TODAY } });
    await expect(staffRead(api, 'shop/today', todaySchema, clock)).resolves.toMatchObject({ ok: true });
    expect(api.calls).toEqual([{ path: 'shop/today', options: { bearer: 'old-access', shopId: SHOP } }]);
  });

  it('refreshes the access token before it runs out, and keeps the new one', async () => {
    await signedIn('2026-11-01T09:00:30.000Z');
    const api = createFakeApi({
      'session/refresh': { ok: true, value: { accessToken: 'new-access', expiresInSeconds: 3600 } },
      'shop/today': { ok: true, value: TODAY },
    });
    await staffRead(api, 'shop/today', todaySchema, clock);
    expect(api.calls.map((call) => call.path)).toEqual(['session/refresh', 'shop/today']);
    expect(api.calls[0]?.options.body).toEqual({ refreshToken: 'refresh-1' });
    expect(api.calls[1]?.options.bearer).toBe('new-access');
    await expect(staffSession.read()).resolves.toEqual({ accessToken: 'new-access', refreshToken: 'refresh-1', expiresAt: '2026-11-01T10:00:00.000Z', shopId: SHOP });
  });

  it('refreshes once and asks again when Hold says the token has lapsed', async () => {
    await signedIn('2026-11-01T10:00:00.000Z');
    let asked = 0;
    const api = createFakeApi({
      'session/refresh': { ok: true, value: { accessToken: 'new-access', expiresInSeconds: 3600 } },
      'shop/today': () => (asked++ === 0 ? { ok: false, failure: 'signed_out' } : { ok: true, value: TODAY }),
    });
    await expect(staffRead(api, 'shop/today', todaySchema, clock)).resolves.toMatchObject({ ok: true });
    expect(api.calls.map((call) => call.path)).toEqual(['shop/today', 'session/refresh', 'shop/today']);
  });

  it('signs the phone out when the refresh token is refused', async () => {
    await signedIn('2026-11-01T08:00:00.000Z');
    const api = createFakeApi({ 'session/refresh': { ok: false, failure: 'signed_out' } });
    await expect(staffRead(api, 'shop/today', todaySchema, clock)).resolves.toEqual({ ok: false, failure: 'signed_out' });
    await expect(staffSession.read()).resolves.toBeUndefined();
  });

  it('keeps the session when the refresh could not reach Hold', async () => {
    await signedIn('2026-11-01T08:00:00.000Z');
    const api = createFakeApi({ 'session/refresh': { ok: false, failure: 'offline' } });
    await expect(staffRead(api, 'shop/today', todaySchema, clock)).resolves.toEqual({ ok: false, failure: 'offline' });
    await expect(staffSession.read()).resolves.toMatchObject({ refreshToken: 'refresh-1' });
  });

  it('is signed out with no session on the phone, and asks nothing', async () => {
    const api = createFakeApi();
    await expect(staffRead(api, 'shop/today', todaySchema, clock)).resolves.toEqual({ ok: false, failure: 'signed_out' });
    expect(api.calls).toEqual([]);
  });
});

describe('a counter action', () => {
  it('posts its input with the language, and reads the answer with the contract', async () => {
    await signedIn('2026-11-01T10:00:00.000Z');
    const api = createFakeApi({ 'shop/actions/show-renter-link': { ok: true, value: { url: 'https://hold.example/r/abc' } } });
    await expect(staffAct(api, 'show-renter-link', { rentalId: 'r-1' }, 'fr', clock)).resolves.toEqual({ ok: true, value: { url: 'https://hold.example/r/abc' } });
    expect(api.calls[0]?.options).toEqual({ bearer: 'old-access', shopId: SHOP, body: { rentalId: 'r-1', locale: 'fr' } });
  });
});
