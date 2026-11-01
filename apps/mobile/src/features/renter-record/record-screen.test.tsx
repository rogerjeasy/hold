import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Share } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import type { RenterView } from '@hold/mobile-api';
import { createFakeApi } from '@/test/fake-api';
import { renderWithProviders } from '@/test/render';
import { RecordScreen } from './record-screen';

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => ({ type: 'opened' })) }));
jest.mock('expo-file-system', () => {
  const File = Object.assign(
    jest.fn().mockImplementation((directory: { uri: string }, name: string) => ({ uri: `${directory.uri}${name}` })),
    { downloadFileAsync: jest.fn(async (_url: string, destination: { uri: string }) => ({ uri: destination.uri })) },
  );
  return { Paths: { cache: { uri: 'file:///cache/' } }, File };
});

const TOKEN = 'D'.repeat(65);
const PACK = '1d2e3f40-5a6b-4c7d-8e9f-a0b1c2d3e4f5';

type Record = RenterView<'record'>;
const record = (overrides: Partial<Record> = {}): Record => ({ shopName: 'Velo Zürich', versions: [], receipts: [], ...overrides });
const ready = (): Record =>
  record({
    versions: [{ id: PACK, version: 2, state: 'ready', createdAt: '2026-11-01T12:00:00.000Z', pdfSha256: 'f'.repeat(64), manifestFingerprint: 'e'.repeat(64) }],
    receipts: [{ id: 'r1', packId: PACK, kind: 'release', status: 'sent', amountCents: null, releasedCents: 30000, createdAt: '2026-11-01T12:00:00.000Z', sentAt: '2026-11-01T12:01:00.000Z' }],
  });

type Replies = NonNullable<Parameters<typeof createFakeApi>[0]>;
const show = (replies: Replies) => renderWithProviders(<RecordScreen token={TOKEN} />, { api: createFakeApi(replies) });
const bodyOf = (api: ReturnType<typeof createFakeApi>, path: string) => api.calls.find((call) => call.path === path)?.options.body;

describe("the rental's record", () => {
  it('prepares the first version', async () => {
    let value = record();
    const view = await show({
      'renter/record': () => ({ ok: true, value }),
      'renter/actions/build-renter-record': () => {
        value = record({ versions: [{ id: PACK, version: 1, state: 'building', createdAt: '2026-11-01T12:00:00.000Z', pdfSha256: null, manifestFingerprint: null }] });
        return { ok: true, value: { packId: PACK } };
      },
    });
    expect(await screen.findByText('No record has been prepared yet.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Prepare current record' }));
    expect(bodyOf(view.api, 'renter/actions/build-renter-record')).toEqual({});
    expect(await screen.findByText(/Preparing your record/)).toBeOnTheScreen();
  });

  it('shows a ready version with its fingerprints, and the receipts', async () => {
    await show({ 'renter/record': { ok: true, value: ready() } });
    expect(await screen.findAllByText('Version 2')).toHaveLength(2);
    expect(screen.getByText('f'.repeat(64))).toBeOnTheScreen();
    expect(screen.getByText('Hold released')).toBeOnTheScreen();
    expect(screen.getByText('Sent')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Update current record' })).toBeOnTheScreen();
  });

  it('opens the PDF in the in-app viewer from its short-lived link', async () => {
    const view = await show({ 'renter/record': { ok: true, value: ready() }, 'renter/actions/download-renter-record': { ok: true, value: { url: 'https://store.example/record.pdf', filename: 'hold-record-v2.pdf' } } });
    await fireEvent.press(await screen.findByRole('button', { name: 'Open the PDF' }));
    expect(bodyOf(view.api, 'renter/actions/download-renter-record')).toEqual({ packId: PACK, kind: 'pdf' });
    await waitFor(() => expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://store.example/record.pdf', expect.anything()));
  });

  it('saves the PDF on the phone and hands it to the share sheet', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    await show({ 'renter/record': { ok: true, value: ready() }, 'renter/actions/download-renter-record': { ok: true, value: { url: 'https://store.example/record.pdf', filename: 'hold-record-v2.pdf' } } });
    await fireEvent.press(await screen.findByRole('button', { name: 'Share the PDF' }));
    await waitFor(() => expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: 'file:///cache/hold-record-v2.pdf' })));
  });

  it('says when the record could not be fetched', async () => {
    await show({ 'renter/record': { ok: true, value: ready() }, 'renter/actions/download-renter-record': { ok: false, failure: 'offline' } });
    await fireEvent.press(await screen.findByRole('button', { name: 'Open the manifest' }));
    expect(await screen.findByText(/This phone is offline/)).toBeOnTheScreen();
    expect(WebBrowser.openBrowserAsync).not.toHaveBeenCalled();
  });
});
