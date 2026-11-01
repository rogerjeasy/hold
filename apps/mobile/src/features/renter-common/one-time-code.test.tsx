import { fireEvent, screen } from '@testing-library/react-native';
import { createFakeApi } from '@/test/fake-api';
import { renderWithProviders } from '@/test/render';
import { OneTimeCode } from './one-time-code';

const TOKEN = 'token-1';
const PATH = 'renter/actions/send-claim-code';
const bodiesOf = (api: ReturnType<typeof createFakeApi>) => api.calls.filter((call) => call.path === PATH).map((call) => call.options.body);
const byText = { via: 'text', phone: '+41 •• ••• 12 34', sandboxContact: false, shown: null } as const;
const byEmail = { via: 'email', phone: null, sandboxContact: false, shown: null } as const;

async function show(replies: Parameters<typeof createFakeApi>[0]) {
  const api = createFakeApi(replies);
  await renderWithProviders(<OneTimeCode token={TOKEN} send="send-claim-code" lead="To answer, you need a code." code="" onCodeChange={() => undefined} />, { api });
  return api;
}

describe('OneTimeCode', () => {
  it('asks for the code the way the renter chose to be reached, and says it went by text to the masked number', async () => {
    const api = await show({ [PATH]: { ok: true, value: byText } });
    await fireEvent.press(await screen.findByRole('button', { name: 'Send me a code' }));
    expect(bodiesOf(api)).toEqual([{ via: 'chosen' }]);
    expect(await screen.findByText('Code sent by text to +41 •• ••• 12 34. It expires in ten minutes.')).toBeOnTheScreen();
  });

  it('lets a renter who got a text have the code sent to their PayPal email instead', async () => {
    const api = await show({ [PATH]: (options) => ({ ok: true, value: options.body?.['via'] === 'email' ? byEmail : byText }) });
    await fireEvent.press(await screen.findByRole('button', { name: 'Send me a code' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Send it to my PayPal email instead' }));
    expect(bodiesOf(api)).toEqual([{ via: 'chosen' }, { via: 'email' }]);
    expect(await screen.findByText('Code sent. It expires in ten minutes.')).toBeOnTheScreen();
  });

  it('offers email when the text could not go', async () => {
    await show({ [PATH]: { ok: false, failure: 'refused', reason: 'text_unavailable' } });
    await fireEvent.press(await screen.findByRole('button', { name: 'Send me a code' }));
    expect(await screen.findByText('The text could not be sent.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Send it to my PayPal email instead' })).toBeOnTheScreen();
  });

  it('shows a demo shop’s text, which was not sent, labelled', async () => {
    await show({ [PATH]: { ok: true, value: { ...byText, shown: 'Ribeira Bikes: your code is 12345678' } } });
    await fireEvent.press(await screen.findByRole('button', { name: 'Send me a code' }));
    expect(await screen.findByText('Ribeira Bikes: your code is 12345678')).toBeOnTheScreen();
    expect(screen.getByText('Sandbox: this text was not sent. It is what the renter would receive.')).toBeOnTheScreen();
  });
});
