import { Pressable, View, type GestureResponderEvent } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useTranslations } from 'use-intl';
import { aspect } from '@hold/design-tokens';
import { checkReportedRegion } from '@hold/domain';
import { regionIn, usePhotoFrame } from '@/features/renter-common/photo-frame';

export type Box = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

// A box a quarter of the photograph wide: close around a scratch or a dent, and within the share of a view a renter's
// box may cover (INSPECTION_LIMITS.maxReportedArea), which the server checks again.
const SIDE = 0.24;

const clamp = (value: number) => Math.min(Math.max(value, 0), 1 - SIDE);

// Where the damage is: a box centred on the point, kept on the photograph. Nothing for a point off the photograph.
export function boxAround(x: number, y: number): Box | undefined {
  if (x < 0 || x > 1 || y < 0 || y > 1) return undefined;
  const box = { x: clamp(x - SIDE / 2), y: clamp(y - SIDE / 2), width: SIDE, height: SIDE };
  return checkReportedRegion(box) ? box : undefined;
}

// The renter taps where the damage is, on their own photograph, shown whole. The box becomes the mark the return is
// checked against.
export function DamageMark({ url, label, box, onMark }: { url: string; label: string; box: Box | undefined; onMark: (box: Box) => void }) {
  const t = useTranslations('incident.send');
  const frame = usePhotoFrame();
  const mark = (event: GestureResponderEvent) => {
    if (frame.rect === undefined) return;
    const placed = boxAround((event.nativeEvent.locationX - frame.rect.left) / frame.rect.width, (event.nativeEvent.locationY - frame.rect.top) / frame.rect.height);
    if (placed === undefined) return;
    void Haptics.selectionAsync();
    onMark(placed);
  };
  return (
    <Pressable
      role="button"
      aria-label={box === undefined ? t('tapToMark', { view: label }) : t('marked', { view: label, x: Math.round((box.x + SIDE / 2) * 100), y: Math.round((box.y + SIDE / 2) * 100) })}
      accessibilityHint={t('tapHint')}
      onPress={mark}
      onLayout={frame.onLayout}
      className="w-full overflow-hidden bg-photo"
      style={{ aspectRatio: aspect.thumbnail }}
    >
      <Image testID="damage-photo" source={{ uri: url }} contentFit="contain" onLoad={frame.onLoad} className="flex-1" aria-hidden accessibilityIgnoresInvertColors />
      {box === undefined || frame.rect === undefined ? null : <View pointerEvents="none" className="absolute border-2 border-mark" style={regionIn(frame.rect, box)} />}
    </Pressable>
  );
}
