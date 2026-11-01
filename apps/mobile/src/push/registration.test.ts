import { staffSession } from '@/storage/staff-session';
import { createFakeApi } from '@/test/fake-api';
import * as device from './device';
import { pushStore } from './push-store';
import { forgetRentalPush, keepPushCurrent, notNowForRental, signOutPush, turnOffCounter, turnOffRental, turnOnCounter, turnOnRental } from './registration';

jest.mock('./device', () => ({ pushPlatform: jest.fn(() => 'ios'), pushPermission: jest.fn(), askForPush: jest.fn(), expoPushToken: jest.fn() }));

const LINK = 'L'.repeat(70);
const PHONE = 'ExponentPushToken[this-phone]';
const SHOP = '0b8f4f2e-5f1e-4c1a-9a35-2f7f6f0e8a01';

beforeEach(() => {
  jest.mocked(device.askForPush).mockResolvedValue('granted');
  jest.mocked(device.pushPermission).mockResolvedValue('granted');
  jest.mocked(device.expoPushToken).mockResolvedValue(PHONE);
});

describe('turning on notifications for a rental', () => {
  it('asks the phone, registers it through the rental’s link, and keeps the reference Hold gave it', async () => {
    const api = createFakeApi({ 'renter/actions/register-push': { ok: true, value: { reference: 'ref-1' } } });
    expect(await turnOnRental(api, LINK, 'Rentals')).toBe('on');
    expect(device.askForPush).toHaveBeenCalledWith('Rentals');
    expect(api.calls).toEqual([{ path: 'renter/actions/register-push', options: { bearer: LINK, body: { pushToken: PHONE, platform: 'ios' } } }]);
    expect(await pushStore.rental(LINK)).toEqual({ state: 'on', reference: 'ref-1' });
    expect(await pushStore.lastToken()).toBe(PHONE);
  });

  it('respects a refusal: nothing is registered, and the rental is kept off', async () => {
    jest.mocked(device.askForPush).mockResolvedValue('denied');
    const api = createFakeApi();
    expect(await turnOnRental(api, LINK, 'Rentals')).toBe('denied');
    expect(api.calls).toEqual([]);
    expect(await pushStore.rental(LINK)).toEqual({ state: 'off' });
  });

  it('says so when the phone has no push token, or Hold refuses, and turns nothing on', async () => {
    jest.mocked(device.expoPushToken).mockResolvedValueOnce(undefined);
    expect(await turnOnRental(createFakeApi(), LINK, 'Rentals')).toBe('unavailable');
    expect(await turnOnRental(createFakeApi({ 'renter/actions/register-push': { ok: false, failure: 'link_invalid' } }), LINK, 'Rentals')).toBe('failed');
    expect(await pushStore.rental(LINK)).toBeUndefined();
  });

  it('remembers “not now” without asking the phone', async () => {
    await notNowForRental(LINK);
    expect(device.askForPush).not.toHaveBeenCalled();
    expect(await pushStore.rental(LINK)).toEqual({ state: 'off' });
  });

  it('turns off: Hold forgets this phone for the rental, and the phone keeps it off', async () => {
    await pushStore.setRental(LINK, { state: 'on', reference: 'ref-1' });
    await pushStore.setLastToken(PHONE);
    const api = createFakeApi({ 'renter/actions/unregister-push': { ok: true, value: {} } });
    await turnOffRental(api, LINK);
    expect(api.calls).toEqual([{ path: 'renter/actions/unregister-push', options: { bearer: LINK, body: { pushToken: PHONE } } }]);
    expect(await pushStore.rental(LINK)).toEqual({ state: 'off' });
  });
});

describe('notifications at the counter', () => {
  beforeEach(() => staffSession.write({ accessToken: 'access', refreshToken: 'refresh', expiresAt: '2099-01-01T00:00:00.000Z', shopId: SHOP }));

  it('register as the signed-in person in their shop, and turn off the same way', async () => {
    const api = createFakeApi({ 'shop/actions/register-push': { ok: true, value: {} }, 'shop/actions/unregister-push': { ok: true, value: {} } });
    expect(await turnOnCounter(api, 'fr', 'Rentals')).toBe('on');
    expect(api.calls[0]).toEqual({ path: 'shop/actions/register-push', options: { bearer: 'access', shopId: SHOP, body: { pushToken: PHONE, platform: 'ios', locale: 'fr' } } });
    expect(await pushStore.counter()).toBe('on');
    await turnOffCounter(api, 'fr');
    expect(api.calls[1]).toEqual({ path: 'shop/actions/unregister-push', options: { bearer: 'access', shopId: SHOP, body: { pushToken: PHONE, locale: 'fr' } } });
    expect(await pushStore.counter()).toBe('off');
  });
});

describe('keeping registrations current', () => {
  it('registers every rental and the counter again when the phone’s push token changed', async () => {
    await staffSession.write({ accessToken: 'access', refreshToken: 'refresh', expiresAt: '2099-01-01T00:00:00.000Z', shopId: SHOP });
    await pushStore.setRental(LINK, { state: 'on', reference: 'ref-1' });
    await pushStore.setCounter('on');
    await pushStore.setLastToken('ExponentPushToken[old]');
    const api = createFakeApi({ 'renter/actions/register-push': { ok: true, value: { reference: 'ref-1' } }, 'shop/actions/register-push': { ok: true, value: {} } });
    await keepPushCurrent(api, 'en');
    expect(api.calls.map((call) => [call.path, call.options.body?.['pushToken']])).toEqual([['renter/actions/register-push', PHONE], ['shop/actions/register-push', PHONE]]);
    expect(await pushStore.lastToken()).toBe(PHONE);
  });

  it('asks nothing when the token is the same, or notifications are not allowed', async () => {
    await pushStore.setRental(LINK, { state: 'on', reference: 'ref-1' });
    await pushStore.setLastToken(PHONE);
    const api = createFakeApi();
    await keepPushCurrent(api, 'en');
    jest.mocked(device.pushPermission).mockResolvedValue('denied');
    await pushStore.setLastToken('ExponentPushToken[old]');
    await keepPushCurrent(api, 'en');
    expect(api.calls).toEqual([]);
    expect(device.askForPush).not.toHaveBeenCalled();
  });
});

describe('forgetting', () => {
  it('a rental removed from this phone: Hold forgets this phone for it too', async () => {
    await pushStore.setRental(LINK, { state: 'on', reference: 'ref-1' });
    await pushStore.setLastToken(PHONE);
    const api = createFakeApi({ 'renter/actions/unregister-push': { ok: true, value: {} } });
    await forgetRentalPush(api, LINK);
    expect(api.calls.map((call) => call.path)).toEqual(['renter/actions/unregister-push']);
    expect(await pushStore.rental(LINK)).toBeUndefined();
    await forgetRentalPush(api, 'never-on');
    expect(api.calls).toHaveLength(1);
  });

  it('the counter on signing out: the token goes with the sign-out, and the choice is asked again next time', async () => {
    await pushStore.setCounter('on');
    await pushStore.setLastToken(PHONE);
    expect(await signOutPush()).toEqual({ pushToken: PHONE });
    expect(await pushStore.counter()).toBeUndefined();
    expect(await signOutPush()).toEqual({});
  });
});
