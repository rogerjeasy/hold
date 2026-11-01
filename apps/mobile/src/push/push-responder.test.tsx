import { Text } from 'react-native';
import { screen, waitFor } from '@testing-library/react-native';
import { Slot } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { staffSession } from '@/storage/staff-session';
import { renderRoutes } from '@/test/render-router';
import { pushStore } from './push-store';
import { PushResponder } from './push-responder';

const LINK = 'L'.repeat(70);
const SHOP = '0b8f4f2e-5f1e-4c1a-9a35-2f7f6f0e8a01';
const OTHER_SHOP = '1c9f5f3e-6f2e-4d2b-8b46-3f8f7f1e9b02';
const RENTAL = '6f1c1e0e-3d2b-4c8e-9a51-2f7b5c1d9e10';
const SLOW = { timeout: 5000 };

const tapped = (data: Record<string, unknown>, identifier = 'n-1') =>
  ({ actionIdentifier: Notifications.DEFAULT_ACTION_IDENTIFIER, notification: { date: 0, request: { identifier, content: { title: 'Shop', body: 'News', data }, trigger: null } } }) as unknown as Notifications.NotificationResponse;

const routes = {
  _layout: () => (
    <>
      <PushResponder />
      <Slot />
    </>
  ),
  index: () => <Text>Start</Text>,
  'r/[token]/claim': () => <Text>The claim</Text>,
  'shop/rental/[rentalId]': () => <Text>The rental at the counter</Text>,
};

describe('a tapped notification', () => {
  it('opens the claim of the saved rental it names, also when it started the app', async () => {
    await pushStore.setRental(LINK, { state: 'on', reference: 'ref-1' });
    jest.mocked(Notifications.useLastNotificationResponse).mockReturnValue(tapped({ kind: 'renter', reference: 'ref-1', page: 'claim' }));
    const view = await renderRoutes(routes);
    expect(await screen.findByText('The claim', {}, SLOW)).toBeOnTheScreen();
    expect(view.getPathname()).toBe(`/r/${LINK}/claim`);
  });

  it('opens a counter screen in the shop it names', async () => {
    await staffSession.write({ accessToken: 'a', refreshToken: 'r', expiresAt: '2099-01-01T00:00:00.000Z', shopId: OTHER_SHOP });
    jest.mocked(Notifications.useLastNotificationResponse).mockReturnValue(tapped({ kind: 'staff', shopId: SHOP, path: `/shop/rental/${RENTAL}` }));
    const view = await renderRoutes(routes);
    expect(await screen.findByText('The rental at the counter', {}, SLOW)).toBeOnTheScreen();
    expect(view.getPathname()).toBe(`/shop/rental/${RENTAL}`);
    expect((await staffSession.read())?.shopId).toBe(SHOP);
  });

  it('opens nothing when it names nothing this phone holds', async () => {
    jest.mocked(Notifications.useLastNotificationResponse).mockReturnValue(tapped({ kind: 'renter', reference: 'someone-else', page: 'claim' }));
    const view = await renderRoutes(routes);
    await waitFor(() => expect(view.getPathname()).toBe('/'), SLOW);
    expect(screen.getByText('Start')).toBeOnTheScreen();
  });

  it('shows notifications that arrive while the app is open, without a sound', async () => {
    jest.mocked(Notifications.useLastNotificationResponse).mockReturnValue(null);
    await renderRoutes(routes);
    const handler = jest.mocked(Notifications.setNotificationHandler).mock.calls[0]?.[0];
    await expect(handler?.handleNotification({} as Notifications.Notification)).resolves.toMatchObject({ shouldShowBanner: true, shouldPlaySound: false });
  });
});
