import { fireEvent, screen } from '@testing-library/react-native';
import type { CaptureSessionView } from '@hold/mobile-api';
import { HANDOVER, MARK_ID, NEW_MARK_ID, SESSION_ID, signInStaff } from '@/features/shop-session/test-fixtures';
import { createFakeApi } from '@/test/fake-api';
import { renderRoutes } from '@/test/render-router';
import { MarksScreen } from './marks-screen';

const SESSION: CaptureSessionView = {
  ...HANDOVER,
  photos: [{ view: 'frame_left', url: 'https://hold.example/left.jpg', simulated: false }],
  missing: ['frame_right'],
  marks: [{ id: MARK_ID, view: 'frame_left', region: { x: 0.1, y: 0.2, width: 0.1, height: 0.1 }, description: 'Scuff on the top tube', confirmed: false, new: false }],
};

const routes = { 'shop/session/[sessionId]/marks': MarksScreen };

async function open(session: CaptureSessionView, replies: Record<string, unknown> = {}) {
  await signInStaff();
  const api = createFakeApi({ [`shop/sessions/${SESSION_ID}`]: { ok: true, value: session }, ...(replies as Record<string, never>) });
  const view = await renderRoutes(routes, { initialUrl: `/shop/session/${SESSION_ID}/marks?view=frame_left`, api });
  await screen.findByText('Scuff on the top tube');
  return view;
}

const body = (view: Awaited<ReturnType<typeof open>>, path: string) => view.api.calls.find((call) => call.path === path)?.options.body;

describe('the marks on a view', () => {
  it('confirms a known mark is still there', async () => {
    const view = await open(SESSION, { 'shop/actions/confirm-known-marks': { ok: true, value: {} } });
    await fireEvent.press(screen.getByRole('button', { name: 'Still there: Scuff on the top tube' }));
    expect(body(view, 'shop/actions/confirm-known-marks')).toEqual({ sessionId: SESSION_ID, markId: [MARK_ID], locale: 'en' });
  });

  it('boxes a new mark where it is tapped and saves its description', async () => {
    const view = await open(SESSION, { 'shop/actions/add-handover-mark': { ok: true, value: { markId: NEW_MARK_ID } } });
    await fireEvent.press(screen.getByRole('button', { name: 'Add a mark' }));
    const photo = screen.getByLabelText('Photograph of Frame, left side');
    await fireEvent(photo, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 400 } } });
    await fireEvent(photo, 'responderGrant', { nativeEvent: { locationX: 150, locationY: 300 } });
    await fireEvent(photo, 'responderRelease', { nativeEvent: { locationX: 150, locationY: 300 } });
    await fireEvent.changeText(screen.getByLabelText('What is the mark?'), 'Chip by the bottle cage');
    await fireEvent.press(screen.getByRole('button', { name: 'Save the mark' }));
    expect(body(view, 'shop/actions/add-handover-mark')).toEqual({ sessionId: SESSION_ID, view: 'frame_left', x: 0.4, y: 0.65, width: 0.2, height: 0.2, description: 'Chip by the bottle cage', locale: 'en' });
    expect(await screen.findByText('Mark saved.')).toBeOnTheScreen();
  });

  it('asks what the mark is before saving it', async () => {
    const view = await open(SESSION);
    await fireEvent.press(screen.getByRole('button', { name: 'Add a mark' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save the mark' }));
    expect(screen.getByText('Describe the mark in up to 200 characters.')).toBeOnTheScreen();
    expect(body(view, 'shop/actions/add-handover-mark')).toBeUndefined();
  });

  it('only shows the marks once the photographs are sealed', async () => {
    await open({ ...SESSION, sealed: true });
    expect(screen.getByText("Sealed. These marks are part of the item's history.")).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Add a mark' })).toBeNull();
  });
});
