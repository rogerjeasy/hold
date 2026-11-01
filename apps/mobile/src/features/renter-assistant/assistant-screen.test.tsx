import { fireEvent, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';
import type { RenterView } from '@hold/mobile-api';
import { createFakeApi } from '@/test/fake-api';
import { renderWithProviders } from '@/test/render';
import { AssistantScreen } from './assistant-screen';

const TOKEN = 'A'.repeat(65);

type Assistant = RenterView<'assistant'>;
const assistant = (overrides: Partial<Assistant> = {}): Assistant => ({
  shopName: 'Velo Zürich',
  timeZone: 'Europe/Zurich',
  currency: 'CHF',
  clientLabel: 'Pocket Pal <b>',
  connected: true,
  revokedAt: null,
  draftReply: { decision: 'contest', comment: 'The hanger was bent at pickup.' },
  actions: [
    { tool: 'get_claim', outcome: 'ok', at: '2026-11-01T09:00:00.000Z' },
    { tool: 'submit_claim_reply', outcome: 'human_confirmation_required', at: '2026-11-01T09:05:00.000Z' },
    { tool: 'brand_new_tool', outcome: 'ok', at: '2026-11-01T09:06:00.000Z' },
  ],
  ...overrides,
});

type Replies = NonNullable<Parameters<typeof createFakeApi>[0]>;
const show = (replies: Replies) => renderWithProviders(<AssistantScreen token={TOKEN} />, { api: createFakeApi(replies) });

describe("the renter's own assistant", () => {
  it('says when no assistant is on this rental', async () => {
    await show({ 'renter/assistant': { ok: false, failure: 'link_invalid' } });
    expect(await screen.findByText('No assistant is connected to this rental now.')).toBeOnTheScreen();
  });

  it('shows its own name as plain, unverified text, and what it did', async () => {
    await show({ 'renter/assistant': { ok: true, value: assistant() } });
    expect(await screen.findByText('An assistant is connected to this rental')).toBeOnTheScreen();
    expect(screen.getByText('Pocket Pal <b>')).toBeOnTheScreen();
    expect(screen.getByText('Read the claim')).toBeOnTheScreen();
    expect(screen.getByText('Waited for you')).toBeOnTheScreen();
    expect(screen.getByText('brand_new_tool')).toBeOnTheScreen();
    expect(screen.getByText('Contest the claim')).toBeOnTheScreen();
    expect(screen.getByText('The hanger was bent at pickup.')).toBeOnTheScreen();
  });

  it('disconnects it after asking once', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => buttons?.find((button) => button.style === 'destructive')?.onPress?.());
    const api = createFakeApi({ 'renter/assistant': { ok: true, value: assistant() }, 'renter/actions/disconnect-assistant': { ok: true, value: {} } });
    await renderWithProviders(<AssistantScreen token={TOKEN} />, { api });
    await fireEvent.press(await screen.findByRole('button', { name: 'Disconnect the assistant' }));
    expect(alert).toHaveBeenCalled();
    expect(api.calls.find((call) => call.path === 'renter/actions/disconnect-assistant')?.options).toEqual({ bearer: TOKEN, body: {} });
    expect(await screen.findByText('Disconnected. Its next call will be refused.')).toBeOnTheScreen();
  });

  it('says when it was disconnected already', async () => {
    await show({ 'renter/assistant': { ok: true, value: assistant({ connected: false, revokedAt: '2026-11-01T10:00:00.000Z', draftReply: null, actions: [] }) } });
    expect(await screen.findByText('The assistant was disconnected')).toBeOnTheScreen();
    expect(screen.getByText('Nothing yet.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Disconnect the assistant' })).toBeNull();
  });

  it('says when the disconnect did not go through', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => buttons?.find((button) => button.style === 'destructive')?.onPress?.());
    await show({ 'renter/assistant': { ok: true, value: assistant() }, 'renter/actions/disconnect-assistant': { ok: false, failure: 'refused', reason: 'not_connected' } });
    await fireEvent.press(await screen.findByRole('button', { name: 'Disconnect the assistant' }));
    expect(await screen.findByText('No assistant is connected to this rental now.')).toBeOnTheScreen();
  });
});
