import { forwardRef, useImperativeHandle } from 'react';
import { View } from 'react-native';
import type { CameraViewProps } from 'expo-camera';

// expo-camera in a test: the permission a test sets, and a camera view that remembers its props so a test can
// "scan" a code or "take" a photograph. Use with jest.mock('expo-camera', () => require('@/test/fake-camera').fakeCamera).
type Permission = { granted: boolean; canAskAgain: boolean; status: 'granted' | 'denied' | 'undetermined' } | null;
type Picture = { uri: string; width: number; height: number; format: 'jpg' };

export const camera: {
  permission: Permission;
  request: jest.Mock<Promise<Permission>, []>;
  props: CameraViewProps | undefined;
  takePictureAsync: jest.Mock<Promise<Picture>, []>;
  allow(): void;
  notAskedYet(): void;
  refused(): void;
  reset(): void;
} = {
  permission: null,
  request: jest.fn(async () => camera.permission),
  props: undefined,
  takePictureAsync: jest.fn(async () => ({ uri: 'file:///photo.jpg', width: 3024, height: 4032, format: 'jpg' as const })),
  allow() {
    camera.permission = { granted: true, canAskAgain: true, status: 'granted' };
  },
  notAskedYet() {
    camera.permission = { granted: false, canAskAgain: true, status: 'undetermined' };
  },
  refused() {
    camera.permission = { granted: false, canAskAgain: false, status: 'denied' };
  },
  reset() {
    camera.permission = null;
    camera.props = undefined;
  },
};

const CameraView = forwardRef<{ takePictureAsync: typeof camera.takePictureAsync }, CameraViewProps>(function CameraView(props, ref) {
  camera.props = props;
  useImperativeHandle(ref, () => ({ takePictureAsync: camera.takePictureAsync }));
  return <View testID="camera-preview" />;
});

export const fakeCamera = {
  CameraView,
  useCameraPermissions: () => [camera.permission, camera.request] as const,
};
