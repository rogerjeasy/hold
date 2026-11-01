import { act, fireEvent, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { ImageManipulator } from 'expo-image-manipulator';
import { ConditionCapture } from '@/components/camera/condition-capture';
import { camera } from '@/test/fake-camera';
import { renderWithProviders } from '@/test/render';

jest.mock('expo-camera', () => jest.requireActual('@/test/fake-camera').fakeCamera);
jest.mock('expo-image-manipulator', () => {
  const context = { resize: jest.fn(), renderAsync: jest.fn() };
  const rendered = { saveAsync: jest.fn(async () => ({ uri: 'file:///small.jpg', width: 1920, height: 2560 })) };
  context.resize.mockReturnValue(context);
  context.renderAsync.mockResolvedValue(rendered);
  return { ImageManipulator: { manipulate: jest.fn(() => context) }, SaveFormat: { JPEG: 'jpeg' }, __context: context };
});

const ghost = { uri: 'https://hold.example/handover-left.jpg', view: 'Left side' };

beforeEach(() => {
  camera.reset();
  camera.allow();
});

const shoot = () => act(() => fireEvent.press(screen.getByRole('button', { name: 'Take photograph' })));

describe('photographing an item', () => {
  it('explains the camera before it is allowed', async () => {
    camera.notAskedYet();
    await renderWithProviders(<ConditionCapture onAccept={jest.fn()} />);
    expect(screen.getByText('Hold needs the camera')).toBeOnTheScreen();
  });

  it('lays the earlier photograph faintly over the camera, and can take it away', async () => {
    await renderWithProviders(<ConditionCapture ghost={ghost} onAccept={jest.fn()} />);
    expect(screen.getByLabelText('Earlier photograph: Left side')).toHaveStyle({ opacity: 0.4 });
    await fireEvent.press(screen.getByRole('button', { name: 'Hide the earlier photograph' }));
    expect(screen.queryByLabelText('Earlier photograph: Left side')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Show the earlier photograph' }));
    expect(screen.getByLabelText('Earlier photograph: Left side')).toBeOnTheScreen();
  });

  it('takes the photograph with a tap the hand can feel, then shows it for review', async () => {
    await renderWithProviders(<ConditionCapture onAccept={jest.fn()} />);
    await shoot();
    expect(Haptics.impactAsync).toHaveBeenCalled();
    expect(screen.getByText('Is the whole item sharp and in frame?')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Use photograph' })).toBeOnTheScreen();
  });

  it('goes back to the camera to retake', async () => {
    await renderWithProviders(<ConditionCapture onAccept={jest.fn()} />);
    await shoot();
    await fireEvent.press(screen.getByRole('button', { name: 'Retake' }));
    expect(screen.getByRole('button', { name: 'Take photograph' })).toBeOnTheScreen();
  });

  it('hands over a downscaled copy when the photograph is used', async () => {
    const onAccept = jest.fn();
    await renderWithProviders(<ConditionCapture onAccept={onAccept} />);
    await shoot();
    await act(() => fireEvent.press(screen.getByRole('button', { name: 'Use photograph' })));
    expect(ImageManipulator.manipulate).toHaveBeenCalledWith('file:///photo.jpg');
    expect(jest.requireMock('expo-image-manipulator').__context.resize).toHaveBeenCalledWith({ height: 2560 });
    expect(onAccept).toHaveBeenCalledWith({ uri: 'file:///small.jpg', width: 1920, height: 2560 });
  });

  it('says so when the photograph could not be taken, and lets the person try again', async () => {
    camera.takePictureAsync.mockRejectedValueOnce(new Error('camera busy'));
    await renderWithProviders(<ConditionCapture onAccept={jest.fn()} />);
    await shoot();
    expect(screen.getByText('The photograph could not be taken. Try again.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Take photograph' })).toBeOnTheScreen();
  });
});
