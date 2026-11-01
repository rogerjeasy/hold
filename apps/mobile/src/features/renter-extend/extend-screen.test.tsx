import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import type { RenterView } from '@hold/mobile-api';
import RenterLayout from '@/app/(renter)/_layout';
import ExtendRoute from '@/app/(renter)/r/[token]/extend';
import ExtendedRoute from '@/app/(renter)/r/[token]/extended';
import { RENTER_TOKEN as TOKEN, startedAnswer } from '@/features/renter-rental/fixtures';
import { createFakeApi } from '@/test/fake-api';
import { renderRoutes } from '@/test/render-router';

jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
const openAuthSession = jest.mocked(WebBrowser.openAuthSessionAsync);

type Extension = RenterView<'extension'>;

const extension = (overrides: Partial<Extension> = {}): { ok: true; value: Extension } => ({
  ok: true,
  value: {
    shopName: 'Velo Zürich',
    timeZone: 'Europe/Zurich',
    currency: 'CHF',
    state: 'out',
    simulated: false,
    canAct: true,
    // 18:00 in Zürich.
    endsAt: '2026-11-04T17:00:00.000Z',
    suggestedEnd: '2026-11-05T18:00',
    maxDays: 3,
    latestEnd: '2026-11-08T17:00:00.000Z',
    holdCents: 60000,
    quote: null,
    extensions: [],
    ...overrides,
  },
});

const quote = { extraDays: 2, feeCents: 9000, endsAt: '2026-11-06T17:00:00.000Z' };

function Landed() {
  const { order, closed } = useLocalSearchParams<{ order?: string; closed?: string }>();
  return <Text>{`Landed ${order ?? ''} ${closed ?? ''}`.trim()}</Text>;
}

type Reply = Parameters<typeof createFakeApi>[0] extends Readonly<Record<string, infer R>> | undefined ? R : never;
const open = (replies: Record<string, Reply>, url = `/r/${TOKEN}/extend`, extended: typeof ExtendedRoute | typeof Landed = Landed) =>
  renderRoutes({ '(renter)/_layout': RenterLayout, '(renter)/r/[token]/extend': ExtendRoute, '(renter)/r/[token]/extended': extended }, { initialUrl: url, api: createFakeApi(replies) });
const bodyOf = (api: ReturnType<typeof createFakeApi>, path: string) => api.calls.filter((call) => call.path === path).map((call) => call.options.body);

describe('keeping it longer', () => {
  it('says when it is due back now, and how far the hold and the shop allow', async () => {
    await open({ 'renter/extension': extension() });
    expect(await screen.findByText('Due back now')).toBeOnTheScreen();
    expect(screen.getByText(/^Your hold covers a return up to .*, and the shop allows up to 3 more days\.$/)).toBeOnTheScreen();
  });

  it('prices the days chosen on the shop clock, at the same time of day', async () => {
    const view = await open({ 'renter/extension': extension(), 'renter/actions/ask-extension': { ok: true, value: { extraDays: 2, feeCents: 9000, currency: 'CHF', endsAt: quote.endsAt } } });
    expect(await screen.findByText('+1 day')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'One day more' }));
    expect(screen.getByText('+2 days')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'See the price' }));
    expect(bodyOf(view.api, 'renter/actions/ask-extension')).toEqual([{ endsAt: '2026-11-06T18:00' }]);
  });

  it('never goes past the most days the shop allows, nor below one', async () => {
    await open({ 'renter/extension': extension({ maxDays: 2 }) });
    await screen.findByText('+1 day');
    expect(screen.getByRole('button', { name: 'One day fewer' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'One day more' }));
    expect(screen.getByRole('button', { name: 'One day more' })).toBeDisabled();
  });

  it("says why Hold will not give more days, with what the renter needs to act on it", async () => {
    await open({ 'renter/extension': extension(), 'renter/actions/ask-extension': { ok: false, failure: 'refused', reason: 'not_free:2026-11-05T07:00:00.000Z' } });
    await fireEvent.press(await screen.findByRole('button', { name: 'See the price' }));
    expect(await screen.findByText(/^Someone has booked it from .*\. Choose an earlier time, or contact the shop\.$/)).toBeOnTheScreen();
  });

  it("shows Hold's price, says the hold stays as it is, and pays it in PayPal from the phone", async () => {
    openAuthSession.mockResolvedValue({ type: 'success', url: 'hold://paypal-return?kind=extension&order=ORDER-3' });
    const view = await open({ 'renter/extension': extension({ quote }), 'renter/actions/pay-extension': startedAnswer('ORDER-3') });
    expect(await screen.findByText('Your price')).toBeOnTheScreen();
    expect(screen.getByText('2 more days')).toBeOnTheScreen();
    expect(screen.getByText(/Your CHF.600\.00 hold stays exactly as it is\./)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: /Pay CHF.90\.00 with PayPal/ }));
    expect(bodyOf(view.api, 'renter/actions/pay-extension')).toEqual([{ returnTo: 'app' }]);
    expect(await screen.findByText('Landed ORDER-3')).toBeOnTheScreen();
    await waitFor(() => expect(view.getPathname()).toBe(`/r/${TOKEN}/extended`));
  });

  it('lists the extensions paid, being paid and refused', async () => {
    await open({
      'renter/extension': extension({
        extensions: [
          { id: 'e1', orderId: 'O1', extraDays: 1, amountCents: 4500, toEndsAt: '2026-11-04T17:00:00.000Z', state: 'paid' },
          { id: 'e2', orderId: 'O2', extraDays: 2, amountCents: 9000, toEndsAt: '2026-11-06T17:00:00.000Z', state: 'failed' },
        ],
      }),
    });
    expect(await screen.findByText('Your extensions')).toBeOnTheScreen();
    expect(screen.getByText(/^1 more day, to .*\. CHF.45\.00 paid\.$/)).toBeOnTheScreen();
    expect(screen.getByText(/PayPal refused the payment, so your return time did not change\.$/)).toBeOnTheScreen();
  });

  it('is closed for a rental the renter does not have with them', async () => {
    await open({ 'renter/extension': extension({ state: 'returned' }) });
    expect(await screen.findByText('Extensions are for a rental you have with you')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'See the price' })).toBeNull();
  });

  it('says a shop that takes no extensions from the phone', async () => {
    await open({ 'renter/extension': extension({ maxDays: 0 }) });
    expect(await screen.findByText('This shop does not take extensions from the phone')).toBeOnTheScreen();
  });

  it('says a link that may only look', async () => {
    await open({ 'renter/extension': extension({ canAct: false }) });
    expect(await screen.findByText('This link shows the rental but cannot extend it. Use the link the shop sent with your booking.')).toBeOnTheScreen();
  });

  it('labels a sample rental', async () => {
    await open({ 'renter/extension': extension({ simulated: true }) });
    expect(await screen.findByText('Sample')).toBeOnTheScreen();
  });
});

describe('back from PayPal after paying for more days', () => {
  it('confirms the order and says the new return time is set', async () => {
    const view = await open({ 'renter/actions/confirm-extension': { ok: true, value: { state: 'paid' } } }, `/r/${TOKEN}/extended?order=ORDER-3`, ExtendedRoute);
    expect(await screen.findByText('Paid. Your new return time is set.')).toBeOnTheScreen();
    expect(bodyOf(view.api, 'renter/actions/confirm-extension')).toEqual([{ orderId: 'ORDER-3' }]);
  });

  it('says plainly when PayPal reviews the payment', async () => {
    await open({ 'renter/actions/confirm-extension': { ok: true, value: { state: 'reviewing' } } }, `/r/${TOKEN}/extended?order=ORDER-3`, ExtendedRoute);
    expect(await screen.findByText(/^PayPal is reviewing your payment, which can take a day or more\./)).toBeOnTheScreen();
  });

  it('sends the renter to choose again when the price went stale', async () => {
    const view = await open(
      { 'renter/actions/confirm-extension': { ok: false, failure: 'refused', reason: 'quote_stale' }, 'renter/extension': extension() },
      `/r/${TOKEN}/extended?order=ORDER-3`,
      ExtendedRoute,
    );
    expect(await screen.findByText('The rental changed since this price was given. Choose the new time again.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Choose the time again' }));
    await waitFor(() => expect(view.getPathname()).toBe(`/r/${TOKEN}/extend`));
  });
});
