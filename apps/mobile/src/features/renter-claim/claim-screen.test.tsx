import { fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import ClaimRoute from '@/app/(renter)/r/[token]/claim';
import { createFakeApi } from '@/test/fake-api';
import { renderWithProviders } from '@/test/render';
import { renderRoutes } from '@/test/render-router';
import { claim, TOKEN } from './fixtures';
import { ClaimScreen } from './claim-screen';

type Replies = NonNullable<Parameters<typeof createFakeApi>[0]>;
const show = (replies: Replies) => renderWithProviders(<ClaimScreen token={TOKEN} />, { api: createFakeApi(replies) });
const bodyOf = (api: ReturnType<typeof createFakeApi>, path: string) => api.calls.find((call) => call.path === path)?.options.body;

describe('a claim before any is made', () => {
  it('says there is no claim yet, rather than a broken link', async () => {
    await show({});
    expect(await screen.findByText('No claim')).toBeOnTheScreen();
    expect(screen.getByText(/A person at the shop approves any claim first/)).toBeOnTheScreen();
  });
});

describe('reading a claim', () => {
  it('shows each line with its price, the reason in the shop’s words, and both photographs', async () => {
    await show({ 'renter/claim': { ok: true, value: claim() } });
    expect(await screen.findByText('Bent rear derailleur')).toBeOnTheScreen();
    expect(screen.getByText('The derailleur hanger is bent inwards; it was straight at handover.')).toBeOnTheScreen();
    expect(screen.getByText('Recorded by Mia Keller')).toBeOnTheScreen();
    expect(screen.getByLabelText('At handover: Bent rear derailleur')).toBeOnTheScreen();
    expect(screen.getByLabelText('At return: Bent rear derailleur')).toBeOnTheScreen();
    expect(screen.getAllByText('CHF 45.00').length).toBeGreaterThan(0);
    expect(screen.getByText('CHF 255.00')).toBeOnTheScreen();
    expect(screen.getByText('Waiting for your reply')).toBeOnTheScreen();
    expect(screen.getByText('Reply by Nov 4, 2026, 6:00 PM')).toBeOnTheScreen();
  });

  it('acknowledges a claim before the reply period starts', async () => {
    const api = createFakeApi({ 'renter/claim': { ok: true, value: claim({ canAcknowledge: true, canReply: false }) }, 'renter/actions/acknowledge-claim': { ok: true, value: {} } });
    await renderWithProviders(<ClaimScreen token={TOKEN} />, { api });
    await fireEvent.press(await screen.findByRole('button', { name: 'I have reviewed this claim' }));
    expect(bodyOf(api, 'renter/actions/acknowledge-claim')).toEqual({});
  });

  it('shows the date the shop promised to decide by, once contested', async () => {
    await show({
      'renter/claim': { ok: true, value: claim({ state: 'contested', canReply: false, promise: { days: 3, decideBy: '2026-11-04T10:00:00.000Z', decidedAt: null, missedAt: null, standing: 'open', missedReason: null } }) },
    });
    expect(await screen.findByText('The shop decides by')).toBeOnTheScreen();
    expect(screen.getByText('Nov 4, 2026, 11:00 AM')).toBeOnTheScreen();
  });
});

describe('answering a claim', () => {
  it('accepts it with the emailed code', async () => {
    let value = claim();
    const view = await show({
      'renter/claim': () => ({ ok: true, value }),
      'renter/actions/send-claim-code': { ok: true, value: { via: 'email', phone: null, sandboxContact: true, shown: null } },
      'renter/actions/accept-claim': () => {
        value = claim({ state: 'charging', canReply: false });
        return { ok: true, value: {} };
      },
    });
    await fireEvent.press(await screen.findByRole('button', { name: 'Send me a code' }));
    expect(bodyOf(view.api, 'renter/actions/send-claim-code')).toEqual({ via: 'chosen' });
    expect(await screen.findByText(/PayPal’s sandbox/)).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('One-time code'), '87654321');
    await fireEvent.press(screen.getByRole('button', { name: 'Accept claim and settle' }));
    expect(bodyOf(view.api, 'renter/actions/accept-claim')).toEqual({ code: '87654321' });
    expect(await screen.findByText('Waiting for PayPal confirmation…')).toBeOnTheScreen();
  });

  it('contests it with the renter’s explanation, which it asks for first', async () => {
    const view = await show({ 'renter/claim': { ok: true, value: claim() }, 'renter/actions/contest-claim': { ok: true, value: {} } });
    await fireEvent.press(await screen.findByRole('radio', { name: 'Contest this claim' }));
    await fireEvent.changeText(screen.getByLabelText('One-time code'), '87654321');
    await fireEvent.press(screen.getByRole('button', { name: 'Contest this claim' }));
    expect(screen.getByText('Write your reason before continuing.')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Your explanation'), 'The hanger was already bent; see my photograph from the pickup.');
    await fireEvent.press(screen.getByRole('button', { name: 'Contest this claim' }));
    expect(bodyOf(view.api, 'renter/actions/contest-claim')).toEqual({ code: '87654321', comment: 'The hanger was already bent; see my photograph from the pickup.' });
  });

  it('says when the code has expired', async () => {
    await show({ 'renter/claim': { ok: true, value: claim() }, 'renter/actions/accept-claim': { ok: false, failure: 'refused', reason: 'code_expired' } });
    await fireEvent.changeText(await screen.findByLabelText('One-time code'), '87654321');
    await fireEvent.press(screen.getByRole('button', { name: 'Accept claim and settle' }));
    expect(await screen.findByText('Request a new verification code.')).toBeOnTheScreen();
  });

  it('says when there were too many tries', async () => {
    await show({ 'renter/claim': { ok: true, value: claim() }, 'renter/actions/send-claim-code': { ok: false, failure: 'rate_limited' } });
    await fireEvent.press(await screen.findByRole('button', { name: 'Send me a code' }));
    expect(await screen.findByText('Too many tries from this network. Wait a minute and try again.')).toBeOnTheScreen();
  });

  it('hands the contest to an advocate with the most the renter will pay, then follows it', async () => {
    const api = createFakeApi({ 'renter/claim': { ok: true, value: claim({ canAdvocate: true, assistantName: 'Pocket Pal' }) }, 'renter/actions/start-advocate': { ok: true, value: { kind: 'negotiation' } } });
    const view = await renderRoutes({ '(renter)/r/[token]/claim': ClaimRoute, '(renter)/r/[token]/negotiation': () => <Text>Negotiation</Text> }, { initialUrl: `/r/${TOKEN}/claim`, api });
    await fireEvent.press(await screen.findByRole('radio', { name: 'Let an advocate argue it for me' }));
    await fireEvent.press(screen.getByRole('radio', { name: /My own assistant, Pocket Pal/ }));
    await fireEvent.changeText(screen.getByLabelText('One-time code'), '87654321');
    await fireEvent.changeText(screen.getByLabelText('The most I will pay, in CHF'), '30,50');
    expect(screen.getByText('CHF 30.50')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Hand my contest to an advocate' }));
    expect(bodyOf(api, 'renter/actions/start-advocate')).toEqual({ code: '87654321', highest: '30,50', advocate: 'assistant' });
    expect(await screen.findByText('Negotiation')).toBeOnTheScreen();
    expect(view.getPathname()).toBe(`/r/${TOKEN}/negotiation`);
  });

  it('refuses an amount that is not one before sending it', async () => {
    const api = createFakeApi({ 'renter/claim': { ok: true, value: claim({ canAdvocate: true }) } });
    await renderWithProviders(<ClaimScreen token={TOKEN} />, { api });
    await fireEvent.press(await screen.findByRole('radio', { name: 'Let an advocate argue it for me' }));
    await fireEvent.changeText(screen.getByLabelText('One-time code'), '87654321');
    await fireEvent.changeText(screen.getByLabelText('The most I will pay, in CHF'), 'thirty');
    await fireEvent.press(screen.getByRole('button', { name: 'Hand my contest to an advocate' }));
    expect(screen.getByText('Write an amount, such as 30 or 30.50.')).toBeOnTheScreen();
    expect(api.calls.map((call) => call.path)).toEqual(['renter/claim']);
  });
});

describe('the messages with the shop', () => {
  it('shows who wrote each one, and sends the renter’s words', async () => {
    let value = claim({ messages: [{ id: 'm1', author: 'shop', authorName: 'Mia', body: 'We can look at it together tomorrow.', createdAt: '2026-11-01T09:00:00.000Z' }] });
    const view = await show({
      'renter/claim': () => ({ ok: true, value }),
      'renter/actions/write-to-shop': () => {
        value = claim({ messages: [...value.messages, { id: 'm2', author: 'renter', authorName: null, body: 'Thank you, 10:00 works.', createdAt: '2026-11-01T10:00:00.000Z' }] });
        return { ok: true, value: {} };
      },
    });
    expect(await screen.findByText('We can look at it together tomorrow.')).toBeOnTheScreen();
    expect(screen.getByText(/Mia, Velo Zürich/)).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Write to the shop'), 'Thank you, 10:00 works.');
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    expect(bodyOf(view.api, 'renter/actions/write-to-shop')).toEqual({ body: 'Thank you, 10:00 works.' });
    expect(await screen.findByText('Thank you, 10:00 works.')).toBeOnTheScreen();
    expect(screen.getByText(/^You ·/)).toBeOnTheScreen();
    expect(screen.getByLabelText('Write to the shop')).toHaveDisplayValue('');
  });
});

describe('the contest summary', () => {
  it("puts the renter's words beside the shop's, with the records' facts", async () => {
    await show({
      'renter/claim': {
        ok: true,
        value: claim({
          state: 'contested',
          canReply: false,
          contest: {
            outcome: 'answered',
            simulated: true,
            version: { overview: 'The renter says the hanger was bent before.', lines: [{ lineId: 'line-1', disputed: true, renterSays: 'Bent before the rental.', renterQuote: 'already bent' }] },
            comment: 'It was already bent.',
            lines: [{ id: 'line-1', description: 'Bent rear derailleur', source: 'finding', findingDescription: null, bothLooksConfirmed: true, knownMarkNearby: false, addedBy: null, reason: '' }],
            rental: { conditionReply: null, conditionRepliedAt: null, renterPhotos: 0, incidentsReported: 0 },
          },
        }),
      },
    });
    expect(await screen.findByText('The renter says the hanger was bent before.')).toBeOnTheScreen();
    expect(screen.getByText('Simulated summary')).toBeOnTheScreen();
    expect(screen.getByText('“already bent”')).toBeOnTheScreen();
    expect(screen.getByText('Found by the comparison, and confirmed by an independent second look.')).toBeOnTheScreen();
  });
});
