import { fireEvent, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { createFakeApi } from '@/test/fake-api';
import { renderWithProviders } from '@/test/render';
import { negotiation, TOKEN } from './fixtures';
import { NegotiationScreen } from './negotiation-screen';

type Replies = NonNullable<Parameters<typeof createFakeApi>[0]>;
const show = (replies: Replies) => renderWithProviders(<NegotiationScreen token={TOKEN} />, { api: createFakeApi(replies) });
const bodyOf = (api: ReturnType<typeof createFakeApi>, path: string) => api.calls.find((call) => call.path === path)?.options.body;

// The system's confirmation, answered with its destructive choice.
const confirmEachAlert = () =>
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    buttons?.find((button) => button.style === 'destructive')?.onPress?.();
  });

describe('following the advocates', () => {
  it('says there is no advocate yet, and leads to the claim', async () => {
    await show({});
    expect(await screen.findByText('No advocate yet')).toBeOnTheScreen();
    expect(screen.getByRole('link', { name: 'Your damage claim' })).toBeOnTheScreen();
  });

  it("shows the renter's own highest total, and every move worded by Hold", async () => {
    await show({ 'renter/negotiation': { ok: true, value: negotiation() } });
    expect(await screen.findByText('CHF 30.00')).toBeOnTheScreen();
    expect(screen.getByText('Only you see this.')).toBeOnTheScreen();
    expect(screen.getByText("Move 1 · The shop's advocate")).toBeOnTheScreen();
    expect(screen.getByText("Move 2 · The renter's advocate")).toBeOnTheScreen();
    expect(screen.getByText('The wear policy covers it: Light scuffs on pedals are ordinary wear.')).toBeOnTheScreen();
    expect(screen.getByText('instead of')).toBeOnTheScreen();
    expect(screen.getByText(/The chain of fingerprints verifies/)).toBeOnTheScreen();
    expect(screen.getByText('The advocates are exchanging offers.')).toBeOnTheScreen();
  });

  it('labels simulated advocates', async () => {
    await show({ 'renter/negotiation': { ok: true, value: negotiation({}, { simulated: true }) } });
    expect(await screen.findByText(/Simulated advocates/)).toBeOnTheScreen();
  });
});

describe('deciding an agreement', () => {
  const agreed = () => negotiation({ awaitingRenter: true }, { state: 'agreed', agreedCents: 2500 });

  it('confirms the agreed amount with a fresh code', async () => {
    const view = await show({
      'renter/negotiation': { ok: true, value: agreed() },
      'renter/actions/send-settlement-code': { ok: true, value: { via: 'email', phone: null, sandboxContact: false, shown: null } },
      'renter/actions/confirm-settlement': { ok: true, value: {} },
    });
    expect((await screen.findAllByText('CHF 25.00')).length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByRole('button', { name: 'Send me a code' }));
    expect(bodyOf(view.api, 'renter/actions/send-settlement-code')).toEqual({ via: 'chosen' });
    await fireEvent.changeText(screen.getByLabelText('One-time code'), '11223344');
    await fireEvent.press(screen.getByRole('button', { name: 'Confirm and settle' }));
    expect(bodyOf(view.api, 'renter/actions/confirm-settlement')).toEqual({ code: '11223344', decision: 'confirm' });
    expect(await screen.findByText('Your answer is recorded.')).toBeOnTheScreen();
  });

  it('declines it, and the owner decides', async () => {
    const view = await show({ 'renter/negotiation': { ok: true, value: agreed() }, 'renter/actions/confirm-settlement': { ok: true, value: {} } });
    await fireEvent.changeText(await screen.findByLabelText('One-time code'), '11223344');
    await fireEvent.press(screen.getByRole('button', { name: 'Decline' }));
    expect(bodyOf(view.api, 'renter/actions/confirm-settlement')).toEqual({ code: '11223344', decision: 'decline' });
  });

  it('says when the code is not right', async () => {
    await show({ 'renter/negotiation': { ok: true, value: agreed() }, 'renter/actions/confirm-settlement': { ok: false, failure: 'refused', reason: 'wrong_code' } });
    await fireEvent.changeText(await screen.findByLabelText('One-time code'), '11223344');
    await fireEvent.press(screen.getByRole('button', { name: 'Confirm and settle' }));
    expect(await screen.findByText('That code is not right. Check it and try again.')).toBeOnTheScreen();
  });
});

describe('stopping the advocate', () => {
  it('asks first, then stops it, charging nothing', async () => {
    const alert = confirmEachAlert();
    let value = negotiation();
    const view = await show({
      'renter/negotiation': () => ({ ok: true, value }),
      'renter/actions/stop-advocate': () => {
        value = negotiation({ stopped: true }, { state: 'escalated', endedReason: 'mandate_ended' });
        return { ok: true, value: {} };
      },
    });
    await fireEvent.press(await screen.findByRole('button', { name: 'Stop my advocate' }));
    expect(alert).toHaveBeenCalled();
    expect(bodyOf(view.api, 'renter/actions/stop-advocate')).toEqual({});
    expect(await screen.findByText('You stopped your advocate.')).toBeOnTheScreen();
  });

  it('shows nothing to act on through a link that cannot act', async () => {
    await show({ 'renter/negotiation': { ok: true, value: negotiation({ canAct: false, awaitingRenter: true }, { state: 'agreed', agreedCents: 2500 }) } });
    expect(await screen.findByText('The advocates agreed. Nothing is charged until each person confirms.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Stop my advocate' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Confirm and settle' })).toBeNull();
  });
});
