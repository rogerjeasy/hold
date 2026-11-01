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
});
