import { fireEvent, screen } from '@testing-library/react-native';
import { useLocales } from 'expo-localization';
import type { RenterView } from '@hold/mobile-api';
import { RENTER_TOKEN as TOKEN, contactView, rentalAnswer } from '@/features/renter-rental/fixtures';
import { createFakeApi } from '@/test/fake-api';
import { renderWithProviders } from '@/test/render';
import { ContactScreen } from './contact-screen';

type Contact = NonNullable<RenterView<'rental'>['contact']>;
type Replies = Parameters<typeof createFakeApi>[0];

const ACTION = (name: string) => `renter/actions/${name}`;
const bodiesOf = (api: ReturnType<typeof createFakeApi>, name: string) => api.calls.filter((call) => call.path === ACTION(name)).map((call) => call.options.body);
const readsOf = (api: ReturnType<typeof createFakeApi>) => api.calls.filter((call) => call.path === 'renter/rental').length;
const SWISS = '+41 ••• •• 67';
const sent = (overrides: Partial<{ phone: string; confirmed: boolean; shown: string | null }> = {}) => ({ ok: true as const, value: { phone: SWISS, confirmed: false, shown: null, ...overrides } });

async function show(contact: Partial<Contact>, replies: Replies = {}) {
  const view = await renderWithProviders(<ContactScreen token={TOKEN} />, { api: createFakeApi({ 'renter/rental': rentalAnswer({}, { contact: contactView(contact) }), ...replies }) });
  // The title is the native header's; the screen opens on how the renter is reached now.
  await screen.findByText(/^By (email|text)/);
  return view.api;
}

describe('how Hold reaches the renter', () => {
  it('chooses texts with the country code of the phone’s region filled in, and confirms the number with the texted code', async () => {
    jest.mocked(useLocales).mockReturnValue([{ languageCode: 'en', languageTag: 'en-CH', regionCode: 'CH' } as ReturnType<typeof useLocales>[0]]);
    const api = await show({}, { [ACTION('send-phone-code')]: sent(), [ACTION('confirm-phone')]: { ok: true, value: { phone: SWISS } } });
    expect(screen.getByText('By email')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Text me instead' }));
    const number = screen.getByLabelText('Your mobile number, with its country code');
    expect(number).toHaveProp('value', '+41 ');
    expect(number).toHaveProp('textContentType', 'telephoneNumber');
    await fireEvent.changeText(number, '+41 79 123 45 67');
    await fireEvent.press(screen.getByRole('button', { name: 'Text me a code' }));
    expect(bodiesOf(api, 'send-phone-code')).toEqual([{ phone: '+41 79 123 45 67', changeCode: '' }]);

    const code = await screen.findByLabelText(`The code we texted to ${SWISS}`);
    // The phone offers the code from the text it just received.
    expect(code).toHaveProp('textContentType', 'oneTimeCode');
    await fireEvent.changeText(code, '12345678');
    const before = readsOf(api);
    await fireEvent.press(screen.getByRole('button', { name: 'Confirm this phone' }));
    expect(bodiesOf(api, 'confirm-phone')).toEqual([{ code: '12345678' }]);
    expect(await screen.findByText(`Texts about this rental now go to ${SWISS}.`)).toBeOnTheScreen();
    expect(readsOf(api)).toBeGreaterThan(before);
  });

  it('says in words why a number or a code was refused', async () => {
    let refuse = true;
    await show({}, {
      [ACTION('send-phone-code')]: () => (refuse ? { ok: false, failure: 'refused', reason: 'phone_invalid' } : sent()),
      [ACTION('confirm-phone')]: { ok: false, failure: 'refused', reason: 'wrong_code' },
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Text me instead' }));
    await fireEvent.changeText(screen.getByLabelText('Your mobile number, with its country code'), '079 123 45 67');
    await fireEvent.press(screen.getByRole('button', { name: 'Text me a code' }));
    expect(await screen.findByText('Write the number with its country code, such as +41 79 123 45 67.')).toBeOnTheScreen();
    refuse = false;
    await fireEvent.changeText(screen.getByLabelText('Your mobile number, with its country code'), '+41 79 123 45 67');
    await fireEvent.press(screen.getByRole('button', { name: 'Text me a code' }));
    await fireEvent.changeText(await screen.findByLabelText(`The code we texted to ${SWISS}`), '00000000');
    await fireEvent.press(screen.getByRole('button', { name: 'Confirm this phone' }));
    expect(await screen.findByText('That code is not correct.')).toBeOnTheScreen();
  });

  it('goes back to email from a confirmed number', async () => {
    const api = await show({ channel: 'text', phone: SWISS, confirmed: true }, { [ACTION('choose-email')]: { ok: true, value: { channel: 'email' } } });
    expect(screen.getByText(`By text to ${SWISS}`)).toBeOnTheScreen();
    expect(screen.getByText('Confirmed')).toBeOnTheScreen();
    const before = readsOf(api);
    await fireEvent.press(screen.getByRole('button', { name: 'Use email instead' }));
    expect(bodiesOf(api, 'choose-email')).toEqual([{}]);
    expect(readsOf(api)).toBeGreaterThan(before);
  });

  it('offers to confirm a number not yet confirmed', async () => {
    await show({ channel: 'text', phone: SWISS, confirmed: false });
    expect(screen.getByText('Not confirmed')).toBeOnTheScreen();
    expect(screen.getByText('Links and reminders come by text. Codes come by email until you confirm this number.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Confirm this number' }));
    expect(screen.getByLabelText('Your mobile number, with its country code')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Your mobile number, with its country code')).toBeNull();
  });

  it('changes the number once the hold is placed only with a code sent where the codes go now', async () => {
    const api = await show(
      { channel: 'text', phone: SWISS, confirmed: true, locked: true },
      { [ACTION('send-contact-change-code')]: { ok: true, value: { via: 'text', phone: SWISS, sandboxContact: false, shown: null } }, [ACTION('send-phone-code')]: sent({ phone: '+33 ••• •• 99' }) },
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Change the number' }));
    expect(screen.getByText('To move your texts to a new phone, we first send a code where your codes go now.')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Your new mobile number, with its country code')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Send me that code' }));
    expect(bodiesOf(api, 'send-contact-change-code')).toEqual([{}]);
    expect(await screen.findByText(`Code sent by text to ${SWISS}. It expires in ten minutes.`)).toBeOnTheScreen();
    // That code can only go where the codes go now.
    expect(screen.queryByRole('button', { name: 'Send it to my PayPal email instead' })).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('The code we just sent'), '87654321');
    await fireEvent.changeText(screen.getByLabelText('Your new mobile number, with its country code'), '+33 6 99 99 99 99');
    await fireEvent.press(screen.getByRole('button', { name: 'Text me a code' }));
    expect(bodiesOf(api, 'send-phone-code')).toEqual([{ phone: '+33 6 99 99 99 99', changeCode: '87654321' }]);
    expect(await screen.findByLabelText('The code we texted to +33 ••• •• 99')).toBeOnTheScreen();
  });

  it('says a change code went to the PayPal email when the codes go there', async () => {
    await show({ locked: true }, { [ACTION('send-contact-change-code')]: { ok: true, value: { via: 'email', phone: null, sandboxContact: false, shown: null } } });
    await fireEvent.press(screen.getByRole('button', { name: 'Text me instead' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Send me that code' }));
    expect(await screen.findByText('Code sent to the email PayPal has for you. It expires in ten minutes.')).toBeOnTheScreen();
  });

  it('in a demo shop shows the text it did not send, labelled, and fills its code in with one tap', async () => {
    const text = 'Demo Bikes: 12345678 is your code.\n\n@hold.example #12345678';
    const api = await show(
      { shown: [{ id: 'text-1', body: 'Demo Bikes: your rental link.' }] },
      { [ACTION('send-phone-code')]: sent({ shown: text }), [ACTION('confirm-phone')]: { ok: true, value: { phone: SWISS } } },
    );
    expect(screen.getByText('Demo Bikes: your rental link.')).toBeOnTheScreen();
    expect(screen.getAllByText('Sample').length).toBe(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Text me instead' }));
    await fireEvent.changeText(screen.getByLabelText('Your mobile number, with its country code'), '+41 79 123 45 67');
    await fireEvent.press(screen.getByRole('button', { name: 'Text me a code' }));
    expect(await screen.findByText(text)).toBeOnTheScreen();
    expect(screen.getByText('Sandbox: this text was not sent. It is what the renter would receive.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Use the code 12345678' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Confirm this phone' }));
    expect(bodiesOf(api, 'confirm-phone')).toEqual([{ code: '12345678' }]);
  });
});
