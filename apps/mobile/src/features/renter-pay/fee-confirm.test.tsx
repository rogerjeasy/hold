import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import RenterLayout from '@/app/(renter)/_layout';
import RentalRoute from '@/app/(renter)/r/[token]/index';
import PaidRoute from '@/app/(renter)/r/[token]/paid';
import { RENTER_TOKEN as TOKEN, rentalAnswer, startedAnswer } from '@/features/renter-rental/fixtures';
import { createFakeApi } from '@/test/fake-api';
import { renderRoutes } from '@/test/render-router';

jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
const openAuthSession = jest.mocked(WebBrowser.openAuthSessionAsync);

const routes = { '(renter)/_layout': RenterLayout, '(renter)/r/[token]/index': RentalRoute, '(renter)/r/[token]/paid': PaidRoute };
const back = (replies: Parameters<typeof createFakeApi>[0], query = 'order=ORDER-1') => renderRoutes(routes, { initialUrl: `/r/${TOKEN}/paid?${query}`, api: createFakeApi(replies) });
const confirms = (api: ReturnType<typeof createFakeApi>) => api.calls.filter((call) => call.path === 'renter/actions/confirm-fee').map((call) => call.options.body);

describe('back from PayPal after approving the fee', () => {
  it('confirms the order it was given, and says the rental is booked', async () => {
    const view = await back({ 'renter/actions/confirm-fee': { ok: true, value: { state: 'booked' } } });
    expect(await screen.findByText('Payment confirmed. Your rental is booked.')).toBeOnTheScreen();
    expect(confirms(view.api)).toEqual([{ orderId: 'ORDER-1' }]);
    expect(view.api.calls[0]?.options.bearer).toBe(TOKEN);
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
  });

  it('waits while PayPal takes the fee, looking again until the rental reads booked', async () => {
    let rental = rentalAnswer({ state: 'pending_payment' });
    await back({ 'renter/actions/confirm-fee': { ok: true, value: { state: 'capturing' } }, 'renter/rental': () => rental });
    expect(await screen.findByText('Checking with PayPal…')).toBeOnTheScreen();
    rental = rentalAnswer({ state: 'booked' });
    await act(async () => jest.advanceTimersByTime(6_000));
    expect(await screen.findByText('Payment confirmed. Your rental is booked.')).toBeOnTheScreen();
  });

  it('takes the renter back to the rental once it is done', async () => {
    const view = await back({ 'renter/actions/confirm-fee': { ok: true, value: { state: 'booked' } }, 'renter/rental': rentalAnswer({ state: 'booked' }) });
    await fireEvent.press(await screen.findByRole('button', { name: 'See your rental' }));
    await waitFor(() => expect(view.getPathname()).toBe(`/r/${TOKEN}`));
  });

  it('says the renter closed PayPal when Hold reads the order as not approved, and opens PayPal again on request', async () => {
    let approved = false;
    openAuthSession.mockImplementation(async () => {
      approved = true;
      return { type: 'success', url: 'hold://paypal-return?kind=fee&order=ORDER-2' };
    });
    const view = await back(
      {
        'renter/actions/confirm-fee': () => (approved ? { ok: true, value: { state: 'booked' } } : { ok: false, failure: 'refused', reason: 'not_approved' }),
        'renter/actions/pay-fee': startedAnswer('ORDER-2'),
      },
      'order=ORDER-1&closed=1',
    );
    expect(await screen.findByText('You closed PayPal before approving. Nothing was charged.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Open PayPal again' }));
    expect(await screen.findByText('Payment confirmed. Your rental is booked.')).toBeOnTheScreen();
    expect(confirms(view.api)).toEqual([{ orderId: 'ORDER-1' }, { orderId: 'ORDER-2' }]);
    expect(view.api.calls.find((call) => call.path === 'renter/actions/pay-fee')?.options.body).toEqual({ returnTo: 'app' });
  });

  it("says PayPal has not confirmed it when the renter came back through PayPal's page", async () => {
    await back({ 'renter/actions/confirm-fee': { ok: false, failure: 'refused', reason: 'not_approved' } });
    expect(await screen.findByText('PayPal has not confirmed your approval yet. Nothing was charged.')).toBeOnTheScreen();
  });

  it('confirms again when the phone was offline', async () => {
    let answer: { ok: false; failure: 'offline' } | { ok: true; value: { state: 'booked' } } = { ok: false, failure: 'offline' };
    const view = await back({ 'renter/actions/confirm-fee': () => answer });
    expect(await screen.findByText('No connection')).toBeOnTheScreen();
    answer = { ok: true, value: { state: 'booked' } };
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Payment confirmed. Your rental is booked.')).toBeOnTheScreen();
    expect(confirms(view.api)).toHaveLength(2);
  });

  it('confirms nothing without an order', async () => {
    const view = await back({}, '');
    expect(await screen.findByText('This link cannot be used')).toBeOnTheScreen();
    expect(confirms(view.api)).toEqual([]);
  });
});
