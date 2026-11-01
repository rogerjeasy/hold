import { fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import ShopLayout from '@/app/shop/_layout';
import TabsLayout from '@/app/shop/(tabs)/_layout';
import TodayLayout from '@/app/shop/(tabs)/(today)/_layout';
import { EMPTY_TODAY, RENTAL_ID, signInStaff, TODAY } from '@/features/shop-session/test-fixtures';
import { createFakeApi } from '@/test/fake-api';
import { renderRoutes } from '@/test/render-router';
import { TodayScreen } from './today-screen';

const routes = {
  'shop/_layout': ShopLayout,
  'shop/(tabs)/_layout': TabsLayout,
  'shop/(tabs)/(today)/_layout': TodayLayout,
  'shop/(tabs)/(today)/index': TodayScreen,
  'shop/(tabs)/drop-offs/index': () => <Text>Drop-offs tab</Text>,
  'shop/rental/[rentalId]/index': () => <Text>Rental screen</Text>,
};

const open = async (today: unknown) => {
  await signInStaff();
  return renderRoutes(routes, { initialUrl: '/shop', api: createFakeApi({ 'shop/today': typeof today === 'function' ? (today as () => never) : { ok: true, value: today } }) });
};

describe('the day at the counter', () => {
  it('says how many decisions wait, and that they are made on the web', async () => {
    await open(TODAY);
    expect(await screen.findByText('3 things need a decision')).toBeOnTheScreen();
    expect(screen.getByText(/decided on the web, where a passkey confirms the person/)).toBeOnTheScreen();
  });

  it('lists what goes out and what comes back, in the shop time', async () => {
    await open(TODAY);
    expect(await screen.findByText('Going out')).toBeOnTheScreen();
    expect(screen.getByText('Priya Raman')).toBeOnTheScreen();
    expect(screen.getByText('9:30 AM')).toBeOnTheScreen();
    expect(screen.getByText('€300.00')).toBeOnTheScreen();
    expect(screen.getByText('Coming back')).toBeOnTheScreen();
    expect(screen.getByText('A renter')).toBeOnTheScreen();
    expect(screen.getByText('Sample')).toBeOnTheScreen();
  });

  it('opens a rental from the day', async () => {
    const view = await open(TODAY);
    await fireEvent.press(await screen.findByRole('button', { name: /Priya Raman/ }));
    expect(view.getPathname()).toBe(`/shop/rental/${RENTAL_ID}`);
  });

  it('leads to the drop point when returns wait there', async () => {
    const view = await open(TODAY);
    await fireEvent.press(await screen.findByRole('button', { name: /1 return waits at the drop point/ }));
    expect(view.getPathname()).toBe('/shop/drop-offs');
  });

  it('says when nothing goes out or comes back', async () => {
    await open(EMPTY_TODAY);
    expect(await screen.findByText('No handovers or returns today')).toBeOnTheScreen();
    expect(screen.getByText('No decisions are waiting')).toBeOnTheScreen();
  });

  it('says why it could not load, and tries again', async () => {
    let answer: unknown = { ok: false, failure: 'offline' };
    await open(() => answer);
    expect(await screen.findByText('No connection')).toBeOnTheScreen();
    answer = { ok: true, value: TODAY };
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Priya Raman')).toBeOnTheScreen();
  });
});
