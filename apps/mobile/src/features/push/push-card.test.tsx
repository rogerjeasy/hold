import { fireEvent, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import * as device from '@/push/device';
import { pushStore } from '@/push/push-store';
import { staffSession } from '@/storage/staff-session';
import { createFakeApi } from '@/test/fake-api';
import { renderWithProviders } from '@/test/render';
import { CounterPush } from './counter-push';
import { RentalPush } from './rental-push';

jest.mock('@/push/device', () => ({ pushAvailable: jest.fn(() => true), pushPlatform: jest.fn(() => 'ios'), pushPermission: jest.fn(), askForPush: jest.fn(), expoPushToken: jest.fn() }));

const LINK = 'L'.repeat(70);
const SHOP = '0b8f4f2e-5f1e-4c1a-9a35-2f7f6f0e8a01';
const registered = { 'renter/actions/register-push': { ok: true, value: { reference: 'ref-1' } }, 'renter/actions/unregister-push': { ok: true, value: {} } } as const;

beforeEach(() => {
  jest.mocked(device.pushAvailable).mockReturnValue(true);
  jest.mocked(device.pushPermission).mockResolvedValue('undetermined');
  jest.mocked(device.askForPush).mockResolvedValue('granted');
  jest.mocked(device.expoPushToken).mockResolvedValue('ExponentPushToken[this-phone]');
});

describe('notifications for a rental', () => {
  it('says why before asking, and asks the phone only when the renter turns them on', async () => {
    const view = await renderWithProviders(<RentalPush token={LINK} />, { api: createFakeApi(registered) });
    expect(await screen.findByText('Hear about this rental on this phone')).toBeOnTheScreen();
    expect(screen.getByText(/One-time codes still come only by text or email/)).toBeOnTheScreen();
    expect(device.askForPush).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Turn on notifications' }));
    expect(await screen.findByText('Notifications on')).toBeOnTheScreen();
    expect(device.askForPush).toHaveBeenCalledWith('Rentals and returns');
    expect(view.api.calls.map((call) => call.path)).toEqual(['renter/actions/register-push']);
  });

  it('keeps “not now”, and offers to turn them on again later', async () => {
    const view = await renderWithProviders(<RentalPush token={LINK} />, { api: createFakeApi(registered) });
    await fireEvent.press(await screen.findByRole('button', { name: 'Not now' }));
    expect(await screen.findByText('Notifications off')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Turn on notifications' })).toBeOnTheScreen();
    expect(device.askForPush).not.toHaveBeenCalled();
    expect(view.api.calls).toEqual([]);
  });

  it('respects the phone’s refusal and points to Settings', async () => {
    jest.mocked(device.askForPush).mockResolvedValue('denied');
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    const view = await renderWithProviders(<RentalPush token={LINK} />, { api: createFakeApi(registered) });
    await fireEvent.press(await screen.findByRole('button', { name: 'Turn on notifications' }));
    expect(await screen.findByText('Notifications are off for Hold')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Open Settings' }));
    expect(openSettings).toHaveBeenCalled();
    expect(view.api.calls).toEqual([]);
  });

  it('turns off for this rental', async () => {
    await pushStore.setRental(LINK, { state: 'on', reference: 'ref-1' });
    await pushStore.setLastToken('ExponentPushToken[this-phone]');
    jest.mocked(device.pushPermission).mockResolvedValue('granted');
    const view = await renderWithProviders(<RentalPush token={LINK} />, { api: createFakeApi(registered) });
    await fireEvent.press(await screen.findByRole('button', { name: 'Turn off' }));
    expect(await screen.findByText('Notifications off')).toBeOnTheScreen();
    expect(view.api.calls.map((call) => call.path)).toEqual(['renter/actions/unregister-push']);
  });
});

describe('a build that cannot receive notifications', () => {
  it('offers none', async () => {
    jest.mocked(device.pushAvailable).mockReturnValue(false);
    await renderWithProviders(<RentalPush token={LINK} />);
    await renderWithProviders(<CounterPush shopName="Ribeira Bikes" />);
    expect(screen.queryByRole('button', { name: 'Turn on notifications' })).toBeNull();
  });
});

describe('notifications at the counter', () => {
  beforeEach(() => staffSession.write({ accessToken: 'access', refreshToken: 'refresh', expiresAt: '2099-01-01T00:00:00.000Z', shopId: SHOP }));

  it('offer themselves once after signing in, and then stay out of the way', async () => {
    const api = createFakeApi({ 'shop/actions/register-push': { ok: true, value: {} } });
    await renderWithProviders(<CounterPush shopName="Ribeira Bikes" offerOnly />, { api });
    await fireEvent.press(await screen.findByRole('button', { name: 'Turn on notifications' }));
    expect(screen.queryByText('Hear about the counter on this phone')).toBeNull();
    expect(api.calls.map((call) => call.path)).toEqual(['shop/actions/register-push']);
  });

  it('are a setting on the account screen, naming the shop', async () => {
    await pushStore.setCounter('off');
    await renderWithProviders(<CounterPush shopName="Ribeira Bikes" />);
    expect(await screen.findByText('This phone does not hear about Ribeira Bikes. Emails still come.')).toBeOnTheScreen();
  });
});
