import { fireEvent, screen } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';
import RenterLayout from '@/app/(renter)/_layout';
import RentalRoute from '@/app/(renter)/r/[token]/index';
import PayRoute from '@/app/(renter)/r/[token]/pay';
import { RENTER_TOKEN as TOKEN, holdAnswer, startedAnswer } from '@/features/renter-rental/fixtures';
import { createFakeApi } from '@/test/fake-api';
import { renderRoutes } from '@/test/render-router';

jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
const openAuthSession = jest.mocked(WebBrowser.openAuthSessionAsync);

const routes = { '(renter)/_layout': RenterLayout, '(renter)/r/[token]/index': RentalRoute, '(renter)/r/[token]/pay': PayRoute };
const open = (replies: Parameters<typeof createFakeApi>[0], query = '') => renderRoutes(routes, { initialUrl: `/r/${TOKEN}/pay${query}`, api: createFakeApi(replies) });
const holdConfirms = (api: ReturnType<typeof createFakeApi>) => api.calls.filter((call) => call.path === 'renter/actions/confirm-hold').map((call) => call.options.body);

describe('approving the hold at pickup', () => {
  it('waits for the shop to ask for it', async () => {
    await open({ 'renter/hold': holdAnswer(null, { state: 'ready' }) });
    expect(await screen.findByText('The shop asks for the hold when you collect your items.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /with PayPal/ })).toBeNull();
  });

  it('says what the hold is, that it is not a charge, and approves exactly that amount in PayPal', async () => {
    openAuthSession.mockResolvedValue({ type: 'success', url: 'hold://paypal-return?kind=hold&order=ORDER-1' });
    const view = await open({ 'renter/hold': holdAnswer({}), 'renter/actions/approve-hold': startedAnswer(), 'renter/actions/confirm-hold': { ok: true, value: { state: 'placed' } } });
    expect(await screen.findByText(/600\.00 is reserved in your PayPal account while you rent\. It is not a charge\./)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: /Approve CHF.600\.00 with PayPal/ }));
    expect(view.api.calls.find((call) => call.path === 'renter/actions/approve-hold')?.options).toEqual({ bearer: TOKEN, body: { returnTo: 'app' } });
    expect(openAuthSession).toHaveBeenCalledWith(expect.stringContaining('ORDER-1'), 'hold://paypal-return');
    expect(await screen.findByText('Hold placed. Nothing was charged.')).toBeOnTheScreen();
    expect(holdConfirms(view.api)).toEqual([{ orderId: 'ORDER-1' }]);
  });

  it('says why a hold is lower than the ordinary one', async () => {
    await open({ 'renter/hold': holdAnswer({ reservedCents: 30000, ordinaryCents: 60000, trust: { version: 1, rung: 2, cleanReturns: 4, windowMonths: 12 } }) });
    expect(await screen.findByText(/because you have returned 4 rentals in good condition in the last 12 months/)).toBeOnTheScreen();
  });

  it('says a declined hold reserved nothing, and lets the renter approve again', async () => {
    await open({ 'renter/hold': holdAnswer({ placementFailure: 'declined' }) });
    expect(await screen.findByText('PayPal declined the hold. Nothing was reserved. You can approve again with another way to pay.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /Approve CHF.600\.00 with PayPal/ })).toBeOnTheScreen();
  });

  it('shows a placed hold and when it ends at the latest', async () => {
    await open({ 'renter/hold': holdAnswer({ state: 'placed', validUntil: '2026-11-30T12:00:00.000Z' }, { state: 'ready' }) });
    expect(await screen.findByText(/Your hold of CHF.600\.00 is placed\. Nothing was charged\./)).toBeOnTheScreen();
    expect(screen.getByText(/It ends on .* at the latest/)).toBeOnTheScreen();
  });

  it('asks for a new hold before the old one ends on a long rental', async () => {
    await open({ 'renter/hold': holdAnswer({ state: 'placed', orderId: 'ORDER-9', validUntil: '2026-11-30T12:00:00.000Z' }, { state: 'out' }) });
    expect(await screen.findByText(/Your hold ends on .*, and your rental is still open\./)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /Approve CHF.600\.00 with PayPal/ })).toBeOnTheScreen();
  });

  it("asks a walk-in's fee and hold together", async () => {
    await open({ 'renter/hold': holdAnswer({ strategy: 'combined' }, { state: 'pending_payment' }) });
    expect(await screen.findByRole('button', { name: /Pay CHF.90\.00 and approve the CHF.600\.00 hold with PayPal/ })).toBeOnTheScreen();
  });
});

describe('back from PayPal after approving the hold', () => {
  it('waits while the hold is placed', async () => {
    await open({ 'renter/actions/confirm-hold': { ok: true, value: { state: 'placing' } }, 'renter/hold': holdAnswer({}) }, '?order=ORDER-1');
    expect(await screen.findByText('Checking with PayPal…')).toBeOnTheScreen();
  });

  it('says a walk-in pays only the fee', async () => {
    await open({ 'renter/actions/confirm-hold': { ok: true, value: { state: 'placed' } }, 'renter/hold': holdAnswer({ state: 'placed', strategy: 'combined' }) }, '?order=ORDER-1');
    expect(await screen.findByText('Hold placed. Only your fee is charged.')).toBeOnTheScreen();
  });

  it('says PayPal declined it, and approves again with a new try in PayPal', async () => {
    openAuthSession.mockResolvedValue({ type: 'success', url: 'hold://paypal-return?kind=hold&order=ORDER-2' });
    let declined = true;
    const view = await open(
      {
        'renter/actions/confirm-hold': () => (declined ? { ok: false, failure: 'refused', reason: 'declined' } : { ok: true, value: { state: 'placed' } }),
        'renter/actions/approve-hold': () => {
          declined = false;
          return startedAnswer('ORDER-2');
        },
        'renter/hold': holdAnswer({}),
      },
      '?order=ORDER-1',
    );
    expect(await screen.findByText('PayPal declined the hold. Nothing was reserved. You can approve again with another way to pay.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Approve again' }));
    expect(await screen.findByText('Hold placed. Nothing was charged.')).toBeOnTheScreen();
    expect(holdConfirms(view.api)).toEqual([{ orderId: 'ORDER-1' }, { orderId: 'ORDER-2' }]);
  });
});
