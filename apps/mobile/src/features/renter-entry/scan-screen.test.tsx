import { act, fireEvent, screen } from '@testing-library/react-native';
import { Linking, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ScanScreen } from '@/features/renter-entry/scan-screen';
import { camera } from '@/test/fake-camera';
import { renderRoutes } from '@/test/render-router';

jest.mock('expo-camera', () => jest.requireActual('@/test/fake-camera').fakeCamera);
jest.mock('@/api/hold', () => ({ ...jest.requireActual('@/api/hold'), holdLinkHosts: () => ['hold.example'] }));

const TOKEN = 'D'.repeat(65);
const routes = {
  '(renter)/scan': ScanScreen,
  '(renter)/r/[token]/index': () => <Text>Rental screen</Text>,
};

const scan = (data: string) =>
  act(async () => {
    camera.props?.onBarcodeScanned?.({ data, type: 'qr', cornerPoints: [], bounds: { origin: { x: 0, y: 0 }, size: { width: 1, height: 1 } } } as never);
  });

beforeEach(() => camera.reset());

describe("scanning the shop's code", () => {
  it('explains the camera before asking for it, and asks only when the person agrees', async () => {
    camera.notAskedYet();
    await renderRoutes(routes, { initialUrl: '/scan' });
    expect(screen.getByText('Hold needs the camera')).toBeOnTheScreen();
    expect(screen.getByText("To read the shop's code at the counter. Nothing is photographed or kept.")).toBeOnTheScreen();
    expect(camera.request).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Allow the camera' }));
    expect(camera.request).toHaveBeenCalledTimes(1);
  });

  it('sends a person who turned the camera off to Settings', async () => {
    camera.refused();
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    await renderRoutes(routes, { initialUrl: '/scan' });
    expect(screen.getByText('The camera is turned off for Hold')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Open Settings' }));
    expect(openSettings).toHaveBeenCalled();
  });

  it("opens the rental a Hold code names, with a tap the hand can feel", async () => {
    camera.allow();
    const view = await renderRoutes(routes, { initialUrl: '/scan' });
    expect(camera.props?.barcodeScannerSettings).toEqual({ barcodeTypes: ['qr'] });
    await scan(`https://hold.example/r/${TOKEN}`);
    expect(Haptics.notificationAsync).toHaveBeenCalled();
    expect(view.getPathname()).toBe(`/r/${TOKEN}`);
  });

  it('says so, and keeps scanning, when a code is not a Hold rental link', async () => {
    camera.allow();
    const view = await renderRoutes(routes, { initialUrl: '/scan' });
    await scan('https://example.com/menu');
    expect(screen.getByText("That code is not a Hold rental link. Ask the shop to show yours.")).toBeOnTheScreen();
    expect(view.getPathname()).toBe('/scan');
  });
});
