import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import ShopLayout from '@/app/shop/_layout';
import AccountRoute from '@/app/shop/account';
import ChooseShopRoute from '@/app/shop/choose-shop';
import SignInRoute from '@/app/shop/sign-in';
import TabsLayout from '@/app/shop/(tabs)/_layout';
import TodayLayout from '@/app/shop/(tabs)/(today)/_layout';
import TodayRoute from '@/app/shop/(tabs)/(today)/index';
import { staffSession } from '@/storage/staff-session';
import { createFakeApi } from '@/test/fake-api';
import { renderRoutes } from '@/test/render-router';
import { demoStore } from './demo-store';
import { ME, OTHER_SHOP_ID, SHOP_ID, signInStaff, TODAY } from './test-fixtures';

const routes = {
  'shop/_layout': ShopLayout,
  'shop/sign-in': SignInRoute,
  'shop/choose-shop': ChooseShopRoute,
  'shop/account': AccountRoute,
  'shop/(tabs)/_layout': TabsLayout,
  'shop/(tabs)/(today)/_layout': TodayLayout,
  'shop/(tabs)/(today)/index': TodayRoute,
};

const signedInWithoutShop = () => staffSession.write({ accessToken: 'access-1', refreshToken: 'refresh-1', expiresAt: '2099-01-01T00:00:00.000Z' });
const today = { ok: true, value: TODAY } as const;
// Several reads of the secure store and of Hold in a row, under the router's fake timers.
const SLOW = { timeout: 5000 };

describe('the shop side', () => {
  it('asks a person who is not signed in to sign in', async () => {
    const view = await renderRoutes(routes, { initialUrl: '/shop' });
    expect(await screen.findByText(/Hold emails you a code that works once/, {}, SLOW)).toBeOnTheScreen();
    expect(view.getPathname()).toBe('/shop/sign-in');
  });

  it('opens on today for a member of staff in a shop', async () => {
    await signInStaff();
    const view = await renderRoutes(routes, { initialUrl: '/shop', api: createFakeApi({ 'shop/today': today }) });
    expect(await screen.findByText('Priya Raman')).toBeOnTheScreen();
    expect(view.getPathname()).toBe('/shop');
  });

  it('goes straight into the only shop the person works in', async () => {
    await signedInWithoutShop();
    await renderRoutes(routes, { initialUrl: '/shop', api: createFakeApi({ 'session/me': { ok: true, value: ME }, 'shop/today': today }) });
    expect(await screen.findByText('Priya Raman')).toBeOnTheScreen();
    await expect(staffSession.read()).resolves.toMatchObject({ shopId: SHOP_ID });
  });

  it('lets a person in several shops choose one', async () => {
    await signedInWithoutShop();
    const me = { ...ME, shops: [...ME.shops, { shopId: OTHER_SHOP_ID, name: 'Velo Porto', role: 'manager' as const }] };
    await renderRoutes(routes, { initialUrl: '/shop', api: createFakeApi({ 'session/me': { ok: true, value: me }, 'shop/today': today }) });
    await fireEvent.press(await screen.findByRole('button', { name: 'Velo Porto, Manager' }));
    expect(await screen.findByText('Priya Raman', {}, SLOW)).toBeOnTheScreen();
    await expect(staffSession.read()).resolves.toMatchObject({ shopId: OTHER_SHOP_ID });
  });

  it('tells a person in no shop to ask the owner', async () => {
    await signedInWithoutShop();
    await renderRoutes(routes, { initialUrl: '/shop', api: createFakeApi({ 'session/me': { ok: true, value: { ...ME, shops: [] } } }) });
    expect(await screen.findByText('You are not part of a shop yet')).toBeOnTheScreen();
  });

  it('goes back to signing in when the session has ended', async () => {
    await signInStaff('2020-01-01T00:00:00.000Z');
    const view = await renderRoutes(routes, { initialUrl: '/shop', api: createFakeApi({ 'session/refresh': { ok: false, failure: 'signed_out' } }) });
    expect(await screen.findByText(/Hold emails you a code that works once/, {}, SLOW)).toBeOnTheScreen();
    expect(view.getPathname()).toBe('/shop/sign-in');
  });
});

describe('who is signed in', () => {
  it('signs out, revoking the refresh token', async () => {
    await signInStaff();
    const view = await renderRoutes(routes, { initialUrl: '/shop/account', api: createFakeApi({ 'session/me': { ok: true, value: ME }, 'session/sign-out': { ok: true, value: {} } }) });
    expect(await screen.findByText('jonas@ribeira.example', {}, SLOW)).toBeOnTheScreen();
    expect(screen.getByText('Counter staff')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByText(/Hold emails you a code that works once/, {}, SLOW)).toBeOnTheScreen();
    expect(view.api.calls.find((call) => call.path === 'session/sign-out')?.options.body).toEqual({ refreshToken: 'refresh-1' });
    await expect(staffSession.read()).resolves.toBeUndefined();
  });

  it('switches the demo to the other person, with the demo this phone keeps', async () => {
    await signInStaff();
    await demoStore.write({ demo: 'sealed-demo', account: 'staff', shopId: SHOP_ID });
    const demo = { accessToken: 'owner-access', refreshToken: 'owner-refresh', expiresInSeconds: 3600, demo: 'sealed-demo-2', shopId: SHOP_ID };
    const view = await renderRoutes(routes, { initialUrl: '/shop/account', api: createFakeApi({ 'session/me': { ok: true, value: ME }, 'session/demo': { ok: true, value: demo } }) });
    expect(await screen.findByText('Sample', {}, SLOW)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Switch to Tomás, the owner' }));
    expect(view.api.calls.find((call) => call.path === 'session/demo')?.options.body).toEqual({ account: 'owner', demo: 'sealed-demo' });
    await waitFor(async () => expect(await staffSession.read()).toMatchObject({ accessToken: 'owner-access' }));
  });
});
