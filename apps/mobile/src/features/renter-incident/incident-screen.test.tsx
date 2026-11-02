import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { Answer } from '@/api';
import { camera } from '@/test/fake-camera';
import { createFakeApi } from '@/test/fake-api';
import { renderWithProviders } from '@/test/render';
import { boxAround } from './damage-mark';
import { INCIDENT, incident, sent, TOKEN } from './fixtures';
import { IncidentScreen } from './incident-screen';

jest.mock('expo-camera', () => jest.requireActual('@/test/fake-camera').fakeCamera);
jest.mock('expo-image-manipulator', () => {
  const context = { resize: jest.fn(), renderAsync: jest.fn() };
  context.resize.mockReturnValue(context);
  context.renderAsync.mockResolvedValue({ saveAsync: jest.fn(async () => ({ uri: 'file:///small.jpg', width: 1920, height: 2560 })) });
  return { ImageManipulator: { manipulate: jest.fn(() => context) }, SaveFormat: { JPEG: 'jpeg' } };
});
jest.mock('expo-file-system', () => ({ File: jest.fn().mockImplementation((uri: string) => ({ uri, size: 2048, bytes: async () => new Uint8Array([1, 2, 3]) })) }));
jest.mock('expo-crypto', () => ({ CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, digest: jest.fn(async () => new Uint8Array(32).fill(171).buffer) }));

type Reply = Parameters<typeof createFakeApi>[0] extends Readonly<Record<string, infer R>> | undefined ? R : never;

const VIEW = `renter/incident/${INCIDENT}`;
const show = (replies: Record<string, Reply>) => renderWithProviders(<IncidentScreen token={TOKEN} incidentId={INCIDENT} />, { api: createFakeApi(replies) });
const bodyOf = (api: ReturnType<typeof createFakeApi>, path: string) => api.calls.find((call) => call.path === path)?.options.body;

beforeEach(() => {
  camera.reset();
  camera.allow();
  globalThis.fetch = jest.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch;
});

describe('writing a report', () => {
  it("shows the renter's own words and the views to photograph, every one optional", async () => {
    await show({ [VIEW]: { ok: true, value: incident() } });
    expect(await screen.findByText('Scraped the left pedal on a kerb.')).toBeOnTheScreen();
    expect(screen.getByText('What happened to City bike, blue')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Left side, Optional' })).toBeOnTheScreen();
    expect(screen.getByText(/You can still send the report/)).toBeOnTheScreen();
  });

  it('photographs a view over the handover photograph and uploads it into the report', async () => {
    let photos: { view: string; url: string | null; simulated: boolean }[] = [];
    const view = await show({
      [VIEW]: () => ({ ok: true, value: incident({}, { photos }) }),
      'renter/actions/request-incident-upload': { ok: true, value: { key: 'evidence/left', url: 'https://store.example/put', headers: { 'content-type': 'image/jpeg' } } },
      'renter/actions/confirm-incident-upload': () => {
        photos = [{ view: 'left', url: 'https://hold.example/left.jpg', simulated: false }];
        return { ok: true, value: { photoId: 'photo-1' } };
      },
    });
    await fireEvent.press(await screen.findByRole('button', { name: 'Left side, Optional' }));
    expect(screen.getByLabelText('Earlier photograph: Left side')).toBeOnTheScreen();
    await act(() => fireEvent.press(screen.getByRole('button', { name: 'Take photograph' })));
    await act(() => fireEvent.press(screen.getByRole('button', { name: 'Use photograph' })));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Left side, Taken' })).toBeOnTheScreen());
    expect(bodyOf(view.api, 'renter/actions/request-incident-upload')).toEqual({ incidentId: INCIDENT, view: 'left', sha256: 'ab'.repeat(32), bytes: 2048 });
    expect(bodyOf(view.api, 'renter/actions/confirm-incident-upload')).toEqual({ incidentId: INCIDENT, view: 'left', key: 'evidence/left', sharpness: 0, shadows: 0, highlights: 0, filled: 0, source: 'camera' });
    expect(globalThis.fetch).toHaveBeenCalledWith('https://store.example/put', expect.objectContaining({ method: 'PUT' }));
    expect(screen.queryByRole('button', { name: 'Take photograph' })).toBeNull();
  });

  it('keeps the camera open and says why when Hold refuses the photograph', async () => {
    await show({
      [VIEW]: { ok: true, value: incident() },
      'renter/actions/request-incident-upload': { ok: false, failure: 'refused', reason: 'sealed' },
    });
    await fireEvent.press(await screen.findByRole('button', { name: 'Right side, Optional' }));
    await act(() => fireEvent.press(screen.getByRole('button', { name: 'Take photograph' })));
    await act(() => fireEvent.press(screen.getByRole('button', { name: 'Use photograph' })));
    expect(await screen.findByText('This report was sent, so no photograph can be added.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Take photograph' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Close the camera' }));
    expect(screen.queryByRole('button', { name: 'Take photograph' })).toBeNull();
  });

  it('sends the report with a box around the damage the renter tapped, then shows what the sorting found', async () => {
    let value = incident({}, { photos: [{ view: 'left', url: 'https://hold.example/left.jpg', simulated: false }] });
    const view = await show({
      [VIEW]: () => ({ ok: true, value }),
      'renter/actions/send-incident-report': () => {
        value = sent({ state: 'reported' });
        return { ok: true, value: { state: 'reported' } };
      },
    });
    const photo = await screen.findByRole('button', { name: /Tap where the damage is on Left side/ });
    await fireEvent(photo, 'layout', { nativeEvent: { layout: { width: 400, height: 300 } } });
    await fireEvent(screen.getByTestId('damage-photo', { includeHiddenElements: true }), 'load', { nativeEvent: { source: { width: 4000, height: 3000 } } });
    await fireEvent.press(photo, { nativeEvent: { locationX: 200, locationY: 150 } });
    expect(screen.getByRole('button', { name: /Marked on Left side, around 50% across and 50% down/ })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Send the report' }));
    expect(bodyOf(view.api, 'renter/actions/send-incident-report')).toEqual({ incidentId: INCIDENT, view: 'left', ...boxAround(0.5, 0.5) });
    expect(await screen.findByText('Your report is stored')).toBeOnTheScreen();
  });

  it('sends a report with no photographs and no box', async () => {
    const view = await show({ [VIEW]: { ok: true, value: incident() }, 'renter/actions/send-incident-report': { ok: true, value: { state: 'reported' } } });
    await fireEvent.press(await screen.findByRole('button', { name: 'Send the report' }));
    expect(bodyOf(view.api, 'renter/actions/send-incident-report')).toEqual({ incidentId: INCIDENT });
  });
});

describe('the box around the damage', () => {
  it('stays on the photograph and small enough for Hold to accept', () => {
    expect(boxAround(0, 0)).toEqual({ x: 0, y: 0, width: 0.24, height: 0.24 });
    expect(boxAround(1, 1)).toEqual({ x: 0.76, y: 0.76, width: 0.24, height: 0.24 });
    expect(boxAround(1.2, 0.5)).toBeUndefined();
  });
});

describe('what the sorting found', () => {
  it('says only to stop using an item that may be unsafe', async () => {
    await show({ [VIEW]: { ok: true, value: sent({ kind: 'unsafe_or_unclear' }) } });
    expect(await screen.findByText('Stop using the item')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Send me a code' })).toBeNull();
  });

  it('agrees a published price with the emailed code, and charges nothing', async () => {
    let value = sent({ kind: 'small_damage', offer: { description: 'Scratched pedal', amountCents: 2500, currency: 'CHF' } });
    const view = await show({
      [VIEW]: () => ({ ok: true, value }),
      'renter/actions/send-incident-code': { ok: true, value: { via: 'email', phone: null, sandboxContact: false, shown: null } },
      'renter/actions/agree-incident-price': () => {
        value = sent({ kind: 'small_damage', state: 'agreed', agreedCents: 2500 });
        return { ok: true, value: {} };
      },
    });
    expect(await screen.findAllByText('CHF 25.00')).toHaveLength(2);
    await fireEvent.press(screen.getByRole('button', { name: 'Send me a code' }));
    expect(bodyOf(view.api, 'renter/actions/send-incident-code')).toEqual({ incidentId: INCIDENT, via: 'chosen' });
    expect(await screen.findByText('Code sent. It expires in ten minutes.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Agree this price' })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('One-time code'), '1234 5678');
    await fireEvent.press(screen.getByRole('button', { name: 'Agree this price' }));
    expect(bodyOf(view.api, 'renter/actions/agree-incident-price')).toEqual({ incidentId: INCIDENT, code: '12345678' });
    expect(await screen.findByText('Agreed price')).toBeOnTheScreen();
    expect(screen.getByText(/Nothing has been charged/)).toBeOnTheScreen();
  });

  it('says plainly when the code is wrong', async () => {
    await show({
      [VIEW]: { ok: true, value: sent({ kind: 'small_damage', offer: { description: 'Scratched pedal', amountCents: 2500, currency: 'CHF' } }) },
      'renter/actions/agree-incident-price': { ok: false, failure: 'refused', reason: 'wrong_code' },
    });
    await fireEvent.changeText(await screen.findByLabelText('One-time code'), '12345678');
    await fireEvent.press(screen.getByRole('button', { name: 'Agree this price' }));
    expect(await screen.findByText('That code is not right. Check it and try again.')).toBeOnTheScreen();
  });

  it('leaves the price for the return', async () => {
    const view = await show({
      [VIEW]: { ok: true, value: sent({ kind: 'small_damage', offer: { description: 'Scratched pedal', amountCents: 2500, currency: 'CHF' } }) },
      'renter/actions/leave-incident-to-return': { ok: true, value: {} },
    });
    await fireEvent.press(await screen.findByRole('button', { name: 'Leave it for the return' }));
    expect(bodyOf(view.api, 'renter/actions/leave-incident-to-return')).toEqual({ incidentId: INCIDENT });
  });

  it('takes the details of a theft, and the police report number later', async () => {
    let value = sent({ kind: 'theft_or_loss', state: 'awaiting_staff' });
    const view = await show({
      [VIEW]: () => ({ ok: true, value }),
      'renter/actions/give-theft-details': () => {
        value = sent({ kind: 'theft_or_loss', state: 'awaiting_staff', theftDetails: { where: 'Station', when: 'Noon', lockAndKeys: 'Locked, keys with me', policeReport: '' } });
        return { ok: true, value: {} };
      },
      'renter/actions/give-police-report': { ok: true, value: {} },
    });
    await fireEvent.press(await screen.findByRole('button', { name: 'Send these details' }));
    expect(screen.getAllByText('Required.')).toHaveLength(3);
    await fireEvent.changeText(screen.getByLabelText('Where it happened'), 'Station');
    await fireEvent.changeText(screen.getByLabelText('When it happened'), 'Noon');
    await fireEvent.changeText(screen.getByLabelText('The lock and the keys: was it locked, and where are the keys?'), 'Locked, keys with me');
    await fireEvent.press(screen.getByRole('button', { name: 'Send these details' }));
    expect(bodyOf(view.api, 'renter/actions/give-theft-details')).toEqual({ incidentId: INCIDENT, where: 'Station', when: 'Noon', lockAndKeys: 'Locked, keys with me' });
    expect(await screen.findByText('Not given yet')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Police report number'), 'ZH-2026-118');
    await fireEvent.press(screen.getByRole('button', { name: 'Add the police report number' }));
    expect(bodyOf(view.api, 'renter/actions/give-police-report')).toEqual({ incidentId: INCIDENT, policeReport: 'ZH-2026-118' });
  });

  it('labels a sorting done by the test stand-in', async () => {
    await show({ [VIEW]: { ok: true, value: sent({ kind: 'mechanical_fault', simulated: true }) } });
    expect(await screen.findByText('A fault')).toBeOnTheScreen();
    expect(screen.getByText(/Sorted by a stand-in/)).toBeOnTheScreen();
    expect(screen.getAllByText('Sample').length).toBeGreaterThan(0);
  });
});

describe('a report that cannot be read', () => {
  it('says the link cannot be used, with nothing to retry', async () => {
    const answer: Answer<never> = { ok: false, failure: 'link_invalid' };
    await show({ [VIEW]: answer });
    expect(await screen.findByText('This link cannot be used')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });
});
