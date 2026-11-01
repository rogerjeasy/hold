import { act, fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import type { CaptureSessionView } from '@hold/mobile-api';
import { putPhoto } from '@/features/photos';
import { COMPARISON_ID, HANDOVER, RENTAL_ID, SESSION_ID, signInStaff } from '@/features/shop-session/test-fixtures';
import { camera } from '@/test/fake-camera';
import { createFakeApi } from '@/test/fake-api';
import { renderRoutes } from '@/test/render-router';
import { SessionScreen } from './session-screen';

jest.mock('expo-camera', () => jest.requireActual('@/test/fake-camera').fakeCamera);
jest.mock('expo-image-manipulator', () => {
  const context = { resize: jest.fn(), renderAsync: jest.fn() };
  const rendered = { saveAsync: jest.fn(async () => ({ uri: 'file:///small.jpg', width: 1920, height: 2560 })) };
  context.resize.mockReturnValue(context);
  context.renderAsync.mockResolvedValue(rendered);
  return { ImageManipulator: { manipulate: jest.fn(() => context) }, SaveFormat: { JPEG: 'jpeg' } };
});
// The file on the phone and the evidence store: the photograph's fingerprint, and whether the store took it.
jest.mock('@/features/photos', () => ({
  ...jest.requireActual('@/features/photos'),
  photoFile: jest.fn(async (uri: string) => ({ uri, bytes: 2048, sha256: 'a'.repeat(64) })),
  putPhoto: jest.fn(async () => true),
}));

const LINK = { key: 'evidence/frame_left', url: 'https://store.example/put', headers: { 'content-type': 'image/jpeg' } };
const routes = {
  'shop/session/[sessionId]/index': SessionScreen,
  'shop/session/[sessionId]/marks': () => <Text>Marks screen</Text>,
  'shop/review/[comparisonId]': () => <Text>Review sheet</Text>,
};

async function open(session: CaptureSessionView, replies: Record<string, unknown> = {}) {
  await signInStaff();
  const api = createFakeApi({
    [`shop/sessions/${SESSION_ID}`]: { ok: true, value: session },
    'shop/actions/request-handover-photo': { ok: true, value: LINK },
    'shop/actions/record-handover-photo': { ok: true, value: { photoId: '0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d' } },
    'shop/actions/request-return-photo': { ok: true, value: LINK },
    'shop/actions/record-return-photo': { ok: true, value: { photoId: '0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d' } },
    ...(replies as Record<string, never>),
  });
  const view = await renderRoutes(routes, { initialUrl: `/shop/session/${SESSION_ID}`, api });
  await screen.findByText('Frame, left side');
  return view;
}

const shootAndUse = async () => {
  await act(() => fireEvent.press(screen.getByRole('button', { name: 'Take photograph' })));
  await act(() => fireEvent.press(screen.getByRole('button', { name: 'Use photograph' })));
};

beforeEach(() => {
  camera.reset();
  camera.allow();
  jest.mocked(putPhoto).mockResolvedValue(true);
});

describe("an item's handover photographs", () => {
  it('lists the views to photograph, needed and optional', async () => {
    await open(HANDOVER);
    expect(screen.getByText('0 of 2 needed views')).toBeOnTheScreen();
    expect(screen.getAllByText('Needed')).toHaveLength(2);
    expect(screen.getByText('Optional')).toBeOnTheScreen();
  });

  it('explains the camera when it is turned off, and offers Settings', async () => {
    camera.refused();
    await open(HANDOVER);
    await fireEvent.press(screen.getByRole('button', { name: 'Photograph Frame, left side' }));
    expect(screen.getByText('The camera is turned off for Hold')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Open Settings' })).toBeOnTheScreen();
  });

  it('photographs each needed view in turn and uploads each one', async () => {
    const view = await open(HANDOVER);
    await fireEvent.press(screen.getByRole('button', { name: 'Photograph Frame, left side' }));
    expect(screen.getByText('1 of 3 · Frame, left side')).toBeOnTheScreen();
    await shootAndUse();
    expect(await screen.findByText('2 of 3 · Frame, right side')).toBeOnTheScreen();
    const asked = view.api.calls.filter((call) => call.path.startsWith('shop/actions/'));
    expect(asked.map((call) => call.path)).toEqual(['shop/actions/request-handover-photo', 'shop/actions/record-handover-photo']);
    expect(asked[0]?.options.body).toEqual({ sessionId: SESSION_ID, view: 'frame_left', sha256: 'a'.repeat(64), bytes: 2048, locale: 'en' });
    expect(asked[1]?.options.body).toEqual({ sessionId: SESSION_ID, view: 'frame_left', key: LINK.key, sharpness: 0, shadows: 0, highlights: 0, filled: 0, locale: 'en' });
    await fireEvent.press(screen.getByRole('button', { name: 'Close the camera' }));
    expect(screen.getByText('Photographed')).toBeOnTheScreen();
  });

  it('says when a photograph did not upload, and uploads it again on a tap', async () => {
    jest.mocked(putPhoto).mockResolvedValue(false);
    const view = await open(HANDOVER);
    await fireEvent.press(screen.getByRole('button', { name: 'Photograph Frame, left side' }));
    await shootAndUse();
    await fireEvent.press(screen.getByRole('button', { name: 'Close the camera' }));
    expect(await screen.findByText('The photograph did not upload. Check the connection and try again.', {}, { timeout: 5000 })).toBeOnTheScreen();
    jest.mocked(putPhoto).mockResolvedValue(true);
    await fireEvent.press(screen.getByRole('button', { name: 'Try the upload of Frame, left side again' }));
    expect(await screen.findByText('Photographed')).toBeOnTheScreen();
    expect(view.api.calls.filter((call) => call.path === 'shop/actions/record-handover-photo')).toHaveLength(1);
  });

  it('says why Hold would not seal', async () => {
    await open({ ...HANDOVER, missing: [] }, { 'shop/actions/seal-handover': { ok: false, failure: 'refused', reason: 'views_missing' } });
    await fireEvent.press(screen.getByRole('button', { name: 'Seal the photographs' }));
    expect(await screen.findByText('Some views still need a photograph.')).toBeOnTheScreen();
  });

  it('seals, says the rental is out and shows the renter the condition report', async () => {
    await open({ ...HANDOVER, missing: [] }, { 'shop/actions/seal-handover': { ok: true, value: { rentalOut: true, conditionLink: { url: 'https://hold.example/r/abc/condition', sent: null } } } });
    await fireEvent.press(screen.getByRole('button', { name: 'Seal the photographs' }));
    expect(await screen.findByText('The rental is out.')).toBeOnTheScreen();
    expect(screen.getByRole('img', { name: 'A code that opens https://hold.example/r/abc/condition' })).toBeOnTheScreen();
  });

  it('says the condition report went to the renter by text', async () => {
    await open({ ...HANDOVER, missing: [] }, { 'shop/actions/seal-handover': { ok: true, value: { rentalOut: true, conditionLink: { url: 'https://hold.example/r/abc/condition', sent: 'text' } } } });
    await fireEvent.press(screen.getByRole('button', { name: 'Seal the photographs' }));
    expect(await screen.findByText('The renter has been texted the condition report. They can also scan this code.')).toBeOnTheScreen();
  });

  it('opens the marks of a photographed view', async () => {
    const view = await open({ ...HANDOVER, photos: [{ view: 'frame_left', url: 'https://hold.example/left.jpg', simulated: false }], missing: ['frame_right'] });
    await fireEvent.press(screen.getByRole('button', { name: 'Marks on Frame, left side' }));
    expect(view.getPathname()).toBe(`/shop/session/${SESSION_ID}/marks`);
  });
});

describe("an item's return photographs", () => {
  const RETURN: CaptureSessionView = { ...HANDOVER, kind: 'return', ghost: [{ view: 'frame_left', url: 'https://hold.example/handover-left.jpg', simulated: false }] };

  it('lays the handover photograph over the camera', async () => {
    await open(RETURN);
    await fireEvent.press(screen.getByRole('button', { name: 'Photograph Frame, left side' }));
    expect(screen.getByLabelText('Earlier photograph: Frame, left side')).toBeOnTheScreen();
    await shootAndUse();
    expect(await screen.findByText('2 of 3 · Frame, right side')).toBeOnTheScreen();
  });

  it('seals the return and leads to noting what was seen', async () => {
    const view = await open({ ...RETURN, missing: [] }, { 'shop/actions/seal-return': { ok: true, value: { rentalId: RENTAL_ID, rentalReturned: true, comparisonId: COMPARISON_ID } } });
    await fireEvent.press(screen.getByRole('button', { name: 'Seal the return photographs' }));
    expect(await screen.findByText('Return sealed. The photographs are being compared. Nothing has been charged.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Note what you saw' }));
    expect(view.getPathname()).toBe(`/shop/review/${COMPARISON_ID}`);
  });
});
