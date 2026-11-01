import { fireEvent, screen } from '@testing-library/react-native';
import { Alert, Share } from 'react-native';
import type { RenterView } from '@hold/mobile-api';
import { createFakeApi } from '@/test/fake-api';
import { renderWithProviders } from '@/test/render';
import { TrustScreen } from './trust-screen';

const TOKEN = 'T'.repeat(65);

type Trust = RenterView<'trust'>;
const trust = (own: Partial<NonNullable<Trust['own']>> = {}, overrides: Partial<Trust> = {}): Trust => ({
  shopName: 'Velo Zürich',
  timeZone: 'Europe/Zurich',
  own: {
    record: { clean: 4, settled: 1, unpaid: 0, open: 0, shops: 2, windowMonths: 24 },
    neverTaken: [{ amount: { cents: 120000, currency: 'CHF' }, rentals: 4 }],
    consent: { answered: false, consented: false },
    ...own,
  },
  credential: { token: 'eyJhbGciOiJFZERTQSJ9.credential', url: 'https://hold.example/verify/eyJ', qr: '<svg/>', expiresAt: '2026-11-01T11:00:00.000Z' },
  ...overrides,
});

type Replies = NonNullable<Parameters<typeof createFakeApi>[0]>;
const show = (replies: Replies) => renderWithProviders(<TrustScreen token={TOKEN} />, { api: createFakeApi(replies) });
const bodyOf = (api: ReturnType<typeof createFakeApi>, path: string) => api.calls.find((call) => call.path === path)?.options.body;

describe('the Clean Record', () => {
  it('says it starts once PayPal has confirmed a payment', async () => {
    await show({ 'renter/trust': { ok: true, value: trust({}, { own: null, credential: null }) } });
    expect(await screen.findByText('Your Clean Record starts once PayPal has confirmed your payment.')).toBeOnTheScreen();
  });

  it('shows the counts, the deposits never taken and a code to scan', async () => {
    await show({ 'renter/trust': { ok: true, value: trust() } });
    expect(await screen.findByText('Returned in good condition')).toBeOnTheScreen();
    expect(screen.getByText('4')).toBeOnTheScreen();
    expect(screen.getByText('CHF 1,200.00')).toBeOnTheScreen();
    expect(screen.getByText('across 4 rentals')).toBeOnTheScreen();
    expect(screen.getByLabelText('Scan to check this Clean Record')).toBeOnTheScreen();
    expect(screen.getByText('eyJhbGciOiJFZERTQSJ9.credential')).toBeOnTheScreen();
  });

  it('shares the credential through the share sheet', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    await show({ 'renter/trust': { ok: true, value: trust() } });
    await fireEvent.press(await screen.findByRole('button', { name: 'Share this credential' }));
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ message: 'https://hold.example/verify/eyJ' }));
  });

  it('answers the question about other shops with the emailed code', async () => {
    let value = trust();
    const view = await show({
      'renter/trust': () => ({ ok: true, value }),
      'renter/actions/send-trust-code': { ok: true, value: { via: 'email', phone: null, sandboxContact: false, shown: null } },
      'renter/actions/answer-consent': () => {
        value = trust({ consent: { answered: true, consented: true } });
        return { ok: true, value: { consented: true } };
      },
    });
    expect(await screen.findByText('Use my record of clean returns to lower future holds at Hold shops.')).toBeOnTheScreen();
    await fireEvent.press(screen.getAllByRole('button', { name: 'Send me a code' })[0]!);
    expect(bodyOf(view.api, 'renter/actions/send-trust-code')).toEqual({ via: 'chosen' });
    await fireEvent.changeText(screen.getAllByLabelText('One-time code')[0]!, '55667788');
    await fireEvent.press(screen.getByRole('button', { name: 'Yes, use it' }));
    expect(bodyOf(view.api, 'renter/actions/answer-consent')).toEqual({ code: '55667788', consent: 'yes' });
    expect(await screen.findByText('Other Hold shops may use your record to lower your hold.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Stop using my record at other Hold shops' })).toBeOnTheScreen();
  });

  it('says when the code is not right', async () => {
    await show({ 'renter/trust': { ok: true, value: trust() }, 'renter/actions/answer-consent': { ok: false, failure: 'refused', reason: 'wrong_code' } });
    await fireEvent.changeText((await screen.findAllByLabelText('One-time code'))[0]!, '55667788');
    await fireEvent.press(screen.getByRole('button', { name: 'No, thank you' }));
    expect(await screen.findByText('That code is not right. Check the email and try again.')).toBeOnTheScreen();
  });

  it('deletes the record only once the renter says they understand, and asks once more', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => buttons?.find((button) => button.style === 'destructive')?.onPress?.());
    const view = await show({ 'renter/trust': { ok: true, value: trust() }, 'renter/actions/delete-record': { ok: true, value: { removed: 5 } } });
    const remove = await screen.findByRole('button', { name: 'Delete my record' });
    expect(remove).toBeDisabled();
    await fireEvent.press(screen.getByRole('switch', { name: 'I understand my record is deleted at every Hold shop' }));
    await fireEvent.changeText(screen.getAllByLabelText('One-time code')[1]!, '99887766');
    await fireEvent.press(screen.getByRole('button', { name: 'Delete my record' }));
    expect(alert).toHaveBeenCalled();
    expect(bodyOf(view.api, 'renter/actions/delete-record')).toEqual({ code: '99887766', understood: 'yes' });
    expect(await screen.findByText('Your record is deleted.')).toBeOnTheScreen();
  });
});
