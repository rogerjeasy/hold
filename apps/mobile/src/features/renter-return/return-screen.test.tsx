import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { Answer } from '@/api';
import { camera } from '@/test/fake-camera';
import { createFakeApi } from '@/test/fake-api';
import { renderWithProviders } from '@/test/render';
import { item, selfReturn, SESSION, TOKEN } from './fixtures';
import { ReturnScreen } from './return-screen';

jest.mock('expo-camera', () => jest.requireActual('@/test/fake-camera').fakeCamera);
jest.mock('expo-image-manipulator', () => {
  const context = { resize: jest.fn(), renderAsync: jest.fn() };
  context.resize.mockReturnValue(context);
  context.renderAsync.mockResolvedValue({ saveAsync: jest.fn(async () => ({ uri: 'file:///small.jpg', width: 1920, height: 2560 })) });
  return { ImageManipulator: { manipulate: jest.fn(() => context) }, SaveFormat: { JPEG: 'jpeg' } };
});
jest.mock('expo-file-system', () => ({ File: jest.fn().mockImplementation((uri: string) => ({ uri, size: 2048, bytes: async () => new Uint8Array([1, 2, 3]) })) }));
jest.mock('expo-crypto', () => ({ CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, digest: jest.fn(async () => new Uint8Array(32).fill(171).buffer) }));

type Replies = NonNullable<Parameters<typeof createFakeApi>[0]>;
const show = (replies: Replies) => renderWithProviders(<ReturnScreen token={TOKEN} />, { api: createFakeApi(replies) });
const bodyOf = (api: ReturnType<typeof createFakeApi>, path: string) => api.calls.find((call) => call.path === path)?.options.body;

beforeEach(() => {
  camera.reset();
  camera.allow();
  globalThis.fetch = jest.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch;
});

describe('before the return', () => {
  it("shows where to leave it in the shop's words, and that nothing is charged before a person looks", async () => {
    await show({ 'renter/return': { ok: true, value: selfReturn() } });
    expect(await screen.findByText('The blue locker left of the door, code 4412.')).toBeOnTheScreen();
    expect(screen.getByText('In the words of Velo Zürich')).toBeOnTheScreen();
    expect(screen.getByText('Nothing is charged now.')).toBeOnTheScreen();
    expect(screen.getByText(/A person at Velo Zürich checks it when the shop opens, Nov 2, 2026, 9:00/)).toBeOnTheScreen();
    expect(screen.getByText('CHF 300.00')).toBeOnTheScreen();
  });

  it('starts the photographs', async () => {
    let value = selfReturn();
    const view = await show({
      'renter/return': () => ({ ok: true, value }),
      'renter/actions/start-self-return': () => {
        value = selfReturn({ stage: 'capture', items: [item()] });
        return { ok: true, value: { sessionIds: [SESSION] } };
      },
    });
    await fireEvent.press(await screen.findByRole('button', { name: 'Start the photographs' }));
    expect(bodyOf(view.api, 'renter/actions/start-self-return')).toEqual({});
    expect(await screen.findByRole('button', { name: 'Left side, To take' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Where you left it, To take' })).toBeOnTheScreen();
  });

  it('says when this link cannot return the rental', async () => {
    await show({ 'renter/return': { ok: true, value: selfReturn({ canAct: false }) } });
    expect(await screen.findByText(/cannot return it/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Start the photographs' })).toBeNull();
  });

  it('says when the shop takes this return at the counter', async () => {
    await show({ 'renter/return': { ok: true, value: selfReturn({ stage: 'unavailable' }) } });
    expect(await screen.findByText('This return is not open here')).toBeOnTheScreen();
  });
});

describe('photographing the return', () => {
  it('cannot be sent while a photograph is still to take', async () => {
    await show({ 'renter/return': { ok: true, value: selfReturn({ stage: 'capture', items: [item()] }) } });
    expect(await screen.findByText('2 photographs still to take')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Send my return' })).toBeDisabled();
  });

  it('uploads a view into the return, matched to the handover photograph', async () => {
    let current = item();
    const view = await show({
      'renter/return': () => ({ ok: true, value: selfReturn({ stage: 'capture', items: [current] }) }),
      'renter/actions/request-self-return-upload': { ok: true, value: { key: 'evidence/left', url: 'https://store.example/put', headers: {} } },
      'renter/actions/confirm-self-return-upload': () => {
        current = item({ missing: ['drop-point'], photos: [{ view: 'left', url: 'https://hold.example/left.jpg', simulated: false }] });
        return { ok: true, value: { photoId: 'photo-1' } };
      },
    });
    await fireEvent.press(await screen.findByRole('button', { name: 'Left side, To take' }));
    expect(screen.getByLabelText('Earlier photograph: Left side')).toBeOnTheScreen();
    await act(() => fireEvent.press(screen.getByRole('button', { name: 'Take photograph' })));
    await act(() => fireEvent.press(screen.getByRole('button', { name: 'Use photograph' })));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Left side, Taken' })).toBeOnTheScreen());
    expect(bodyOf(view.api, 'renter/actions/request-self-return-upload')).toEqual({ sessionId: SESSION, view: 'left', sha256: 'ab'.repeat(32), bytes: 2048 });
    expect(bodyOf(view.api, 'renter/actions/confirm-self-return-upload')).toMatchObject({ sessionId: SESSION, view: 'left', key: 'evidence/left' });
    expect(screen.getByText('1 photograph still to take')).toBeOnTheScreen();
  });

  it('asks for the drop point with no earlier photograph behind it', async () => {
    await show({ 'renter/return': { ok: true, value: selfReturn({ stage: 'capture', items: [item()] }) } });
    await fireEvent.press(await screen.findByRole('button', { name: 'Where you left it, To take' }));
    expect(screen.getByText('Step back so the item and the drop point are both in the photograph.')).toBeOnTheScreen();
    expect(screen.queryByLabelText(/Earlier photograph/)).toBeNull();
  });

  it('tells the renter at the drop point when a photograph was used before', async () => {
    await show({
      'renter/return': { ok: true, value: selfReturn({ stage: 'capture', items: [item()] }) },
      'renter/actions/request-self-return-upload': { ok: true, value: { key: 'evidence/left', url: 'https://store.example/put', headers: {} } },
      'renter/actions/confirm-self-return-upload': { ok: false, failure: 'refused', reason: 'photo_reused' },
    });
    await fireEvent.press(await screen.findByRole('button', { name: 'Left side, To take' }));
    await act(() => fireEvent.press(screen.getByRole('button', { name: 'Take photograph' })));
    await act(() => fireEvent.press(screen.getByRole('button', { name: 'Use photograph' })));
    expect(await screen.findByText('This photograph was used before. Take a new one of the item as it is now.')).toBeOnTheScreen();
  });

  it('sends the return once every photograph is taken', async () => {
    let value = selfReturn({ stage: 'capture', items: [item({ missing: [], photos: [{ view: 'left', url: null, simulated: true }, { view: 'drop-point', url: null, simulated: true }] })] });
    const view = await show({
      'renter/return': () => ({ ok: true, value }),
      'renter/actions/send-self-return': () => {
        value = selfReturn({ stage: 'sent', rentalState: 'dropped_off', droppedOffAt: '2026-11-01T19:42:00.000Z', items: value.items });
        return { ok: true, value: {} };
      },
    });
    expect(await screen.findByText('Sample photographs')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Send my return' }));
    expect(bodyOf(view.api, 'renter/actions/send-self-return')).toEqual({});
    expect(await screen.findByText('Returned on time')).toBeOnTheScreen();
  });

  it('says plainly when the phone is offline while sending', async () => {
    await show({
      'renter/return': { ok: true, value: selfReturn({ stage: 'capture', items: [item({ missing: [] })] }) },
      'renter/actions/send-self-return': { ok: false, failure: 'offline' },
    });
    await fireEvent.press(await screen.findByRole('button', { name: 'Send my return' }));
    expect(await screen.findByText(/This phone is offline/)).toBeOnTheScreen();
  });
});

describe('the receipt', () => {
  const receipt = (overrides = {}) =>
    selfReturn({
      stage: 'sent',
      rentalState: 'dropped_off',
      droppedOffAt: '2026-11-01T19:42:00.000Z',
      items: [item({ missing: [], photos: [{ view: 'left', url: 'https://hold.example/left.jpg', simulated: false }, { view: 'drop-point', url: 'https://hold.example/drop.jpg', simulated: false }] })],
      ...overrides,
    });

  it('shows when it came back, what PayPal holds now and the sealed photographs', async () => {
    await show({ 'renter/return': { ok: true, value: receipt({ paypal: { status: 'created', amountCents: 30000, checkedAt: '2026-11-01T19:43:00.000Z' } }) } });
    expect(await screen.findByText('8:42 PM')).toBeOnTheScreen();
    expect(screen.getByText('Reserved, not taken')).toBeOnTheScreen();
    expect(screen.getByText('Checked with PayPal at 8:43 PM')).toBeOnTheScreen();
    expect(screen.getByText('CHF 300.00')).toBeOnTheScreen();
    expect(screen.getByText('2 photographs, sealed at 8:42 PM')).toBeOnTheScreen();
    expect(screen.getByLabelText('Where you left it')).toBeOnTheScreen();
  });

  it('says when the shop could not find it at the drop point', async () => {
    await show({ 'renter/return': { ok: true, value: receipt({ missingAt: '2026-11-02T08:15:00.000Z' }) } });
    expect(await screen.findByText('Velo Zürich could not find it at the drop point')).toBeOnTheScreen();
    expect(screen.getByText('Not found at the drop point')).toBeOnTheScreen();
  });

  it('shows the hold released once a person has checked it', async () => {
    await show({ 'renter/return': { ok: true, value: receipt({ rentalState: 'returned', hold: { reservedCents: 30000, state: 'released' } }) } });
    expect(await screen.findByText('Hold released')).toBeOnTheScreen();
    expect(screen.getByText('Velo Zürich checked it')).toBeOnTheScreen();
  });
});

describe('a return that cannot be read', () => {
  it('offers to try again when Hold took too long', async () => {
    const answer: Answer<never> = { ok: false, failure: 'timeout' };
    await show({ 'renter/return': answer });
    expect(await screen.findByText('Hold is taking too long to answer')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
  });
});
