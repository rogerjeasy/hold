import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { RenterView } from '@hold/mobile-api';
import { RENTER_TOKEN as TOKEN } from '@/features/renter-rental/fixtures';
import { camera } from '@/test/fake-camera';
import { createFakeApi } from '@/test/fake-api';
import { renderWithProviders } from '@/test/render';
import { ConditionScreen } from './condition-screen';

jest.mock('expo-camera', () => jest.requireActual('@/test/fake-camera').fakeCamera);
jest.mock('expo-image-manipulator', () => {
  const context = { resize: jest.fn(), renderAsync: jest.fn() };
  context.resize.mockReturnValue(context);
  context.renderAsync.mockResolvedValue({ saveAsync: jest.fn(async () => ({ uri: 'file:///small.jpg', width: 1920, height: 2560 })) });
  return { ImageManipulator: { manipulate: jest.fn(() => context) }, SaveFormat: { JPEG: 'jpeg' } };
});
jest.mock('expo-file-system', () => ({ File: jest.fn().mockImplementation((uri: string) => ({ uri, size: 2048, bytes: async () => new Uint8Array([1, 2, 3]) })) }));
jest.mock('expo-crypto', () => ({ CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, digest: jest.fn(async () => new Uint8Array(32).fill(171).buffer) }));

const ITEM = '6f1c2b3a-1d2e-4f5a-8b6c-7d8e9f0a1b2c';
type Condition = RenterView<'condition'>;

const report = (overrides: Partial<Condition> = {}, added: Condition['items'][number]['added'] = []): { ok: true; value: Condition } => ({
  ok: true,
  value: {
    shopName: 'Velo Zürich',
    timeZone: 'Europe/Zurich',
    open: true,
    reply: null,
    closesAt: '2026-11-03T08:00:00.000Z',
    canReply: true,
    items: [
      {
        itemId: ITEM,
        label: 'City e-bike #4',
        photos: [
          { view: 'left', label: 'Left side', url: 'https://display.example/left.jpg' },
          { view: 'right', label: 'Right side', url: null },
        ],
        marks: [{ id: 'mark-1', view: 'left', region: { x: 0.2, y: 0.3, width: 0.1, height: 0.1 }, description: 'Scuff on the chain guard' }],
        added,
      },
    ],
    ...overrides,
  },
});

type Reply = Parameters<typeof createFakeApi>[0] extends Readonly<Record<string, infer R>> | undefined ? R : never;
const show = (replies: Record<string, Reply>) => renderWithProviders(<ConditionScreen token={TOKEN} />, { api: createFakeApi(replies) });
const bodyOf = (api: ReturnType<typeof createFakeApi>, path: string) => api.calls.find((call) => call.path === path)?.options.body;

beforeEach(() => {
  camera.reset();
  camera.allow();
  globalThis.fetch = jest.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch;
});

describe('the condition report from the handover', () => {
  it('shows each item as it left, with every mark staff noted, and until when it can be answered', async () => {
    await show({ 'renter/condition': report() });
    expect(await screen.findByText('City e-bike #4')).toBeOnTheScreen();
    expect(screen.getByLabelText('City e-bike #4: Left side')).toBeOnTheScreen();
    expect(screen.getByText('Scuff on the chain guard')).toBeOnTheScreen();
    expect(screen.getByText(/^You can confirm it or add what was missed until /)).toBeOnTheScreen();
    expect(screen.getAllByText('Preparing the photograph…').length).toBeGreaterThan(0);
  });

  it('is not there before the handover', async () => {
    await show({ 'renter/condition': { ok: false, failure: 'not_found' } });
    expect(await screen.findByText('The rental has not been handed over yet.')).toBeOnTheScreen();
  });

  it('confirms everything is as shown, and then says so', async () => {
    let answer = report();
    const view = await show({ 'renter/condition': () => answer, 'renter/actions/confirm-condition': () => {
      answer = report({ reply: 'confirmed' });
      return { ok: true, value: {} };
    } });
    await fireEvent.press(await screen.findByRole('button', { name: 'Everything is as shown' }));
    expect(await screen.findByText('You confirmed the photographs.')).toBeOnTheScreen();
    expect(bodyOf(view.api, 'renter/actions/confirm-condition')).toEqual({});
    expect(screen.queryByRole('button', { name: 'Everything is as shown' })).toBeNull();
  });

  it('says why an answer was refused', async () => {
    await show({ 'renter/condition': report(), 'renter/actions/confirm-condition': { ok: false, failure: 'refused', reason: 'closed' } });
    await fireEvent.press(await screen.findByRole('button', { name: 'Everything is as shown' }));
    expect(await screen.findByText('The time to answer has passed.')).toBeOnTheScreen();
  });

  it('photographs something staff missed, uploads it to that item, and sends it', async () => {
    let answer = report();
    const view = await show({
      'renter/condition': () => answer,
      'renter/actions/request-missed-upload': { ok: true, value: { key: 'evidence/missed-1', url: 'https://store.example/put', headers: { 'content-type': 'image/jpeg' } } },
      'renter/actions/confirm-missed-upload': () => {
        answer = report({}, [{ view: 'missed-1', url: 'https://display.example/missed-1.jpg' }]);
        return { ok: true, value: { photoId: 'photo-1' } };
      },
      'renter/actions/send-missed': () => {
        answer = report({ reply: 'added' }, [{ view: 'missed-1', url: 'https://display.example/missed-1.jpg' }]);
        return { ok: true, value: {} };
      },
    });
    await fireEvent.press(await screen.findByRole('button', { name: 'Add a photograph of something missed' }));
    expect(screen.getByRole('button', { name: 'Send what I added' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Photograph something missed' }));
    await act(() => fireEvent.press(screen.getByRole('button', { name: 'Take photograph' })));
    await act(() => fireEvent.press(screen.getByRole('button', { name: 'Use photograph' })));
    await waitFor(() => expect(bodyOf(view.api, 'renter/actions/confirm-missed-upload')).toBeDefined());
    expect(bodyOf(view.api, 'renter/actions/request-missed-upload')).toEqual({ itemId: ITEM, view: 'missed-1', sha256: 'ab'.repeat(32), bytes: 2048 });
    expect(bodyOf(view.api, 'renter/actions/confirm-missed-upload')).toEqual({ itemId: ITEM, view: 'missed-1', key: 'evidence/missed-1', sharpness: 0, shadows: 0, highlights: 0, filled: 0 });
    expect(await screen.findByLabelText('Your photograph 1 of City e-bike #4')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Send what I added' }));
    expect(await screen.findByText('You added photographs of what was missed. The shop sees them with the handover.')).toBeOnTheScreen();
    expect(bodyOf(view.api, 'renter/actions/send-missed')).toEqual({});
  });

  it('asks for the link sent at handover when this one cannot answer', async () => {
    await show({ 'renter/condition': report({ canReply: false }) });
    expect(await screen.findByText('Answer from the link the shop sent you at handover.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Everything is as shown' })).toBeNull();
  });

  it('says when the time to answer has passed', async () => {
    await show({ 'renter/condition': report({ open: false }) });
    expect(await screen.findByText('The time to answer has passed.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Everything is as shown' })).toBeNull();
  });
});
