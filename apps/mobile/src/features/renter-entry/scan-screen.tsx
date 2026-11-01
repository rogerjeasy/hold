import { useRef, useState } from 'react';
import { View } from 'react-native';
import { CameraView, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslations } from 'use-intl';
import { holdLinkHosts } from '@/api';
import { CameraPermissionGate } from '@/components/camera/camera-permission';
import { Text } from '@/components/ui';
import { rentalTokenFrom } from '@/links/rental-link';

// Scanning the code the shop shows at the counter. A Hold rental code opens the rental at once; any other code is
// named as such and the camera keeps looking.
export function ScanScreen() {
  const t = useTranslations('scan');
  return (
    <CameraPermissionGate reason={t('cameraReason')}>
      <Scanner />
    </CameraPermissionGate>
  );
}

function Scanner() {
  const t = useTranslations('scan');
  const insets = useSafeAreaInsets();
  const [missed, setMissed] = useState(false);
  // The camera reports the same code many times a second; only the first one counts.
  const opened = useRef(false);

  const scanned = ({ data }: BarcodeScanningResult) => {
    if (opened.current) return;
    const token = rentalTokenFrom(data, holdLinkHosts());
    if (token === undefined) return setMissed(true);
    opened.current = true;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace(`/r/${token}`);
  };

  return (
    <View className="flex-1 bg-photo">
      <CameraView className="flex-1" facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={scanned} />
      <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
        <View className="aspect-square w-2/3 max-w-80 border-2 border-photo-foreground" />
      </View>
      <View className="absolute inset-x-0 bottom-0 gap-2 bg-photo-scrim px-4 pt-4" style={{ paddingBottom: insets.bottom + 16 }}>
        <Text tone="onPhoto" role={missed ? 'alert' : undefined} accessibilityLiveRegion="polite" className="text-center">
          {missed ? t('notHold') : t('hint')}
        </Text>
      </View>
    </View>
  );
}
