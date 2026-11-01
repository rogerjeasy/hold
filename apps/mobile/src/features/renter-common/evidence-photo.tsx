import { View } from 'react-native';
import { Image } from 'expo-image';
import { useTranslations } from 'use-intl';
import { aspect } from '@hold/design-tokens';
import { Text } from '@/components/ui';
import { regionIn, usePhotoFrame } from './photo-frame';

type Region = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

// One evidence photograph, whole, in a frame of the camera's own shape, so nothing jumps while it loads and nothing of
// the evidence is cropped away. Hold sends a short-lived display copy with faces blurred; until the shop's worker has
// prepared it, the frame says so. A region, given as shares of the photograph, is outlined where the damage is.
export function EvidencePhoto({ url, label, region }: { url: string | null; label: string; region?: Region | null }) {
  const t = useTranslations('renterAction.photo');
  const frame = usePhotoFrame();
  return (
    <View className="w-full overflow-hidden bg-photo" style={{ aspectRatio: aspect.thumbnail }} onLayout={frame.onLayout}>
      {url === null ? (
        <View className="flex-1 items-center justify-center p-3" accessible aria-label={`${label}: ${t('preparing')}`}>
          <Text variant="small" tone="onPhoto" className="text-center">
            {t('preparing')}
          </Text>
        </View>
      ) : (
        <Image source={{ uri: url }} contentFit="contain" transition={150} onLoad={frame.onLoad} className="flex-1" accessible aria-label={label} accessibilityIgnoresInvertColors />
      )}
      {region === null || region === undefined || url === null || frame.rect === undefined ? null : (
        <View pointerEvents="none" aria-hidden className="absolute border-2 border-mark" style={regionIn(frame.rect, region)} />
      )}
    </View>
  );
}
