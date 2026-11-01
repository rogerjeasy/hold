import { View } from 'react-native';
import { Image } from 'expo-image';
import { useTranslations } from 'use-intl';
import { aspect } from '@hold/design-tokens';
import { Text } from '@/components/ui';
import { regionIn, usePhotoFrame } from '@/features/renter-common/photo-frame';

type Mark = { readonly id: string; readonly region: { x: number; y: number; width: number; height: number } };

// A handover photograph shown whole, with every mark staff noted boxed where they found it, so the renter sees exactly
// what they will never be charged for. A 4:3 frame is kept while it loads or while the shop's worker prepares it.
export function MarkedPhoto({ url, label, marks }: { url: string | null; label: string; marks: readonly Mark[] }) {
  const t = useTranslations('condition');
  const frame = usePhotoFrame();
  const rect = frame.rect;
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
      {url === null || rect === undefined
        ? null
        : marks.map((mark) => <View key={mark.id} pointerEvents="none" aria-hidden className="absolute border-2 border-mark" style={regionIn(rect, mark.region)} />)}
    </View>
  );
}
