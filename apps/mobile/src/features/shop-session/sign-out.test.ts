import { pushStore } from '@/push/push-store';
import { staffSession } from '@/storage/staff-session';
import { createFakeApi } from '@/test/fake-api';
import { signOut } from './sign-out';

const signedIn = () => staffSession.write({ accessToken: 'access-1', refreshToken: 'refresh-1', expiresAt: '2099-01-01T00:00:00.000Z' });

describe('signing out of the phone', () => {
  it('names the phone’s push token with the person’s bearer, so Hold ends its counter notifications too', async () => {
    await signedIn();
    await pushStore.setCounter('on');
    await pushStore.setLastToken('ExponentPushToken[this-phone]');
    const api = createFakeApi({ 'session/sign-out': { ok: true, value: {} } });
    await signOut(api);
    expect(api.calls).toEqual([{ path: 'session/sign-out', options: { bearer: 'access-1', body: { refreshToken: 'refresh-1', pushToken: 'ExponentPushToken[this-phone]' } } }]);
    expect(await staffSession.read()).toBeUndefined();
    expect(await pushStore.counter()).toBeUndefined();
  });

  it('sends no push token when the counter’s notifications were not on', async () => {
    await signedIn();
    const api = createFakeApi({ 'session/sign-out': { ok: true, value: {} } });
    await signOut(api);
    expect(api.calls[0]?.options.body).toEqual({ refreshToken: 'refresh-1' });
  });

  it('renews a lapsed access token first, so Hold can still end this phone’s counter notifications', async () => {
    await staffSession.write({ accessToken: 'lapsed', refreshToken: 'refresh-1', expiresAt: '2026-11-01T08:00:00.000Z' });
    await pushStore.setCounter('on');
    await pushStore.setLastToken('ExponentPushToken[this-phone]');
    const api = createFakeApi({ 'session/refresh': { ok: true, value: { accessToken: 'renewed', expiresInSeconds: 3600 } }, 'session/sign-out': { ok: true, value: {} } });
    await signOut(api, () => new Date('2026-11-01T09:00:00.000Z'));
    expect(api.calls.map((call) => call.path)).toEqual(['session/refresh', 'session/sign-out']);
    expect(api.calls[1]?.options).toEqual({ bearer: 'renewed', body: { refreshToken: 'refresh-1', pushToken: 'ExponentPushToken[this-phone]' } });
    expect(await staffSession.read()).toBeUndefined();
  });

  it('forgets the session on the phone even when Hold cannot be reached', async () => {
    await signedIn();
    const api = createFakeApi({ 'session/sign-out': { ok: false, failure: 'offline' } });
    await signOut(api);
    expect(await staffSession.read()).toBeUndefined();
  });
});
