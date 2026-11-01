import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import RenterLayout from '@/app/(renter)/_layout';
import RentalRoute from '@/app/(renter)/r/[token]/index';
import { savedRentals } from '@/storage/saved-rentals';
import { createFakeApi } from '@/test/fake-api';
import { renderRoutes } from '@/test/render-router';
import { RENTER_TOKEN as TOKEN, rentalAnswer, startedAnswer } from './fixtures';

jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
const openAuthSession = jest.mocked(WebBrowser.openAuthSessionAsync);

// Where a tap leads: each page the rental links to shows its own path and what it was given.
function Landed() {
  const params = useLocalSearchParams<{ order?: string; closed?: string }>();
  return <Text>{`Landed ${params.order ?? ''} ${params.closed ?? ''}`.trim()}</Text>;
}

const routes = {
  '(renter)/_layout': RenterLayout,
  '(renter)/r/[token]/index': RentalRoute,
  '(renter)/r/[token]/paid': Landed,
  '(renter)/r/[token]/pay': Landed,
  '(renter)/r/[token]/condition': Landed,
  '(renter)/r/[token]/extend': Landed,
  '(renter)/r/[token]/incident/index': Landed,
  '(renter)/r/[token]/return': Landed,
  '(renter)/r/[token]/claim': Landed,
  '(renter)/r/[token]/record': Landed,
  '(renter)/r/[token]/trust': Landed,
  '(renter)/r/[token]/assistant': Landed,
};

const open = (replies: Parameters<typeof createFakeApi>[0]) => renderRoutes(routes, { initialUrl: `/r/${TOKEN}`, api: createFakeApi(replies) });

describe("a renter's rental", () => {
  it('says where it stands, when it is due back, what is rented and the two amounts kept apart', async () => {
    await open({ 'renter/rental': rentalAnswer() });
    expect(await screen.findByText('Your rental is with you.')).toBeOnTheScreen();
    expect(screen.getByText('Velo Zürich')).toBeOnTheScreen();
    expect(screen.getByText(/^Due back /)).toBeOnTheScreen();
    expect(screen.getByText('1 × City e-bike')).toBeOnTheScreen();
    expect(screen.getByText('Two amounts, kept apart')).toBeOnTheScreen();
    expect(screen.getAllByText(/90\.00/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/600\.00/).length).toBeGreaterThan(0);
    expect(screen.getByText('Scratch on the frame')).toBeOnTheScreen();
    expect(screen.getByText('Dust and light tyre wear are ordinary.')).toBeOnTheScreen();
  });

  it('reads it with the rental link as the bearer, and keeps the link on this phone', async () => {
    const view = await open({ 'renter/rental': rentalAnswer() });
    await screen.findByText('Your rental is with you.');
    expect(view.api.calls[0]).toMatchObject({ path: 'renter/rental', options: { bearer: TOKEN } });
    await waitFor(async () => expect((await savedRentals.list()).map((rental) => rental.token)).toEqual([TOKEN]));
  });

  it('labels a sample rental', async () => {
    await open({ 'renter/rental': rentalAnswer({ simulated: true }) });
    expect(await screen.findByText('Sample')).toBeOnTheScreen();
  });

  it('says a link that cannot be used, and offers no retry that would only fail again', async () => {
    await open({ 'renter/rental': { ok: false, failure: 'link_invalid' } });
    expect(await screen.findByText('This link cannot be used')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('offers a retry when the phone is offline', async () => {
    let answer: ReturnType<typeof rentalAnswer> | { ok: false; failure: 'offline' } = { ok: false, failure: 'offline' };
    await open({ 'renter/rental': () => answer });
    expect(await screen.findByText('No connection')).toBeOnTheScreen();
    answer = rentalAnswer();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Your rental is with you.')).toBeOnTheScreen();
  });

  it('links each page that applies to it, by its path under the rental', async () => {
    const view = await open({
      'renter/rental': rentalAnswer({}, { canExtend: true, canReport: true, selfReturn: { offered: true, shopClosed: false, droppedOffAt: null } }),
    });
    await screen.findByText('Your rental is with you.');
    for (const name of ['See how it left', 'Keep it longer', 'Something happened', 'Return it yourself', 'Your rental record', 'Your Clean Record']) {
      expect(screen.getByRole('button', { name: new RegExp(name) })).toBeOnTheScreen();
    }
    await fireEvent.press(screen.getByRole('button', { name: /Keep it longer/ }));
    await waitFor(() => expect(view.getPathname()).toBe(`/r/${TOKEN}/extend`));
  });

  it('opens the report of something that happened at its own page', async () => {
    const view = await open({ 'renter/rental': rentalAnswer({}, { canReport: true }) });
    await fireEvent.press(await screen.findByRole('button', { name: /Something happened/ }));
    await waitFor(() => expect(view.getPathname()).toBe(`/r/${TOKEN}/incident`));
  });

  it('leaves out what does not apply: no extension, no report and no condition report before handover', async () => {
    await open({ 'renter/rental': rentalAnswer({ state: 'booked' }) });
    expect(await screen.findByText('Booked. Your fee is paid.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /Keep it longer/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Something happened/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /See how it left/ })).toBeNull();
  });

  it('shows a claim once Hold has one for the rental, with where it stands', async () => {
    const view = await open({
      'renter/rental': rentalAnswer({ state: 'settling' }),
      'renter/claim': { ok: true, value: claimValue() },
    });
    const claim = await screen.findByRole('button', { name: /Your damage claim/ });
    expect(screen.getByText('Waiting for your reply')).toBeOnTheScreen();
    await fireEvent.press(claim);
    await waitFor(() => expect(view.getPathname()).toBe(`/r/${TOKEN}/claim`));
  });

  it('sends a renter whose hold is asked for to approve it', async () => {
    const view = await open({ 'renter/rental': rentalAnswer({ state: 'awaiting_hold' }) });
    expect(await screen.findByText('The shop is ready for your hold.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Approve the hold' }));
    await waitFor(() => expect(view.getPathname()).toBe(`/r/${TOKEN}/pay`));
  });

  it('points at an assistant connected to the rental', async () => {
    await open({ 'renter/rental': rentalAnswer({}, { assistant: { connected: true, revoked: false } }) });
    expect(await screen.findByRole('button', { name: /An assistant is connected to this rental/ })).toBeOnTheScreen();
  });

  it('asks once whether the Clean Record may be used elsewhere', async () => {
    await open({ 'renter/rental': rentalAnswer({}, { askConsent: true }) });
    expect(await screen.findByText('Use my record of clean returns to lower future holds at Hold shops.')).toBeOnTheScreen();
  });
});

describe('paying the fee from the phone', () => {
  const due = () => rentalAnswer({ state: 'pending_payment' });

  it("starts the payment for the app, opens PayPal's own page in a session, then confirms the order it was given", async () => {
    openAuthSession.mockResolvedValue({ type: 'success', url: 'hold://paypal-return?kind=fee&order=ORDER-1' });
    const view = await open({ 'renter/rental': due(), 'renter/actions/pay-fee': startedAnswer() });
    await fireEvent.press(await screen.findByRole('button', { name: /Pay CHF.90\.00 with PayPal/ }));
    expect(view.api.calls.find((call) => call.path === 'renter/actions/pay-fee')?.options).toEqual({ bearer: TOKEN, body: { returnTo: 'app' } });
    expect(openAuthSession).toHaveBeenCalledWith('https://www.sandbox.paypal.com/checkoutnow?token=ORDER-1', 'hold://paypal-return');
    expect(await screen.findByText('Landed ORDER-1')).toBeOnTheScreen();
    expect(view.getPathname()).toBe(`/r/${TOKEN}/paid`);
  });

  it('still confirms when the renter closed PayPal, so the server decides, and says they closed it', async () => {
    openAuthSession.mockResolvedValue({ type: 'cancel' } as WebBrowser.WebBrowserResult);
    await open({ 'renter/rental': due(), 'renter/actions/pay-fee': startedAnswer() });
    await fireEvent.press(await screen.findByRole('button', { name: /Pay CHF.90\.00 with PayPal/ }));
    expect(await screen.findByText('Landed ORDER-1 1')).toBeOnTheScreen();
  });

  it("says why Hold would not start it, and opens nothing", async () => {
    await open({ 'renter/rental': due(), 'renter/actions/pay-fee': { ok: false, failure: 'refused', reason: 'paypal_not_connected' } });
    await fireEvent.press(await screen.findByRole('button', { name: /Pay CHF.90\.00 with PayPal/ }));
    expect(await screen.findByText('The shop cannot take payments yet. Contact the shop.')).toBeOnTheScreen();
    expect(openAuthSession).not.toHaveBeenCalled();
  });

  it('says nothing was charged when the phone could not reach Hold', async () => {
    await open({ 'renter/rental': due(), 'renter/actions/pay-fee': { ok: false, failure: 'offline' } });
    await fireEvent.press(await screen.findByRole('button', { name: /Pay CHF.90\.00 with PayPal/ }));
    expect(await screen.findByText('This phone is offline. Nothing was changed. Try again when you have a signal.')).toBeOnTheScreen();
    expect(openAuthSession).not.toHaveBeenCalled();
  });

  it('asks a walk-in to pay the fee and approve the hold in one approval', async () => {
    openAuthSession.mockResolvedValue({ type: 'dismiss' } as WebBrowser.WebBrowserResult);
    const view = await open({ 'renter/rental': rentalAnswer({ state: 'pending_payment', walkIn: true }), 'renter/actions/approve-hold': startedAnswer('ORDER-2') });
    await fireEvent.press(await screen.findByRole('button', { name: /Pay CHF.90\.00 and approve the CHF.600\.00 hold with PayPal/ }));
    expect(view.api.calls.find((call) => call.path === 'renter/actions/approve-hold')?.options.body).toEqual({ returnTo: 'app' });
    expect(await screen.findByText('Landed ORDER-2 1')).toBeOnTheScreen();
    expect(view.getPathname()).toBe(`/r/${TOKEN}/pay`);
  });
});

function claimValue() {
  return {
    shopName: 'Velo Zürich',
    timeZone: 'Europe/Zurich',
    currency: 'CHF',
    state: 'presented' as const,
    totalCents: 4000,
    captureCents: 4000,
    releaseCents: 56000,
    invoiceCents: 0,
    replyDueAt: null,
    holdState: 'placed' as const,
    pendingSettlement: false,
    canAcknowledge: false,
    canReply: true,
    canAdvocate: false,
    canWrite: true,
    assistantName: null,
    negotiation: false,
    lines: [],
    contest: null,
    promise: null,
    messages: [],
    now: '2026-11-05T10:00:00.000Z',
  };
}
