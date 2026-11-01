import { useRef, useState } from 'react';
import { View, type GestureResponderEvent } from 'react-native';
import { Image } from 'expo-image';
import { useTranslations } from 'use-intl';
import { aspect } from '@hold/design-tokens';
import { Text } from '@/components/ui';
import { boxBetween, pointIn, type Region } from './mark-region';

type PhotoMarksProps = {
  url: string;
  label: string;
  marks: readonly { readonly id: string; readonly region: Region; readonly new: boolean }[];
  // While a new mark is being drawn: its box, and what a tap or a drag makes it.
  draft?: Region;
  onDraft?: (region: Region) => void;
};

const at = (region: Region) => ({ left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` }) as const;

// A view's photograph with its marks boxed and numbered as in the list below it. While drawing, a tap boxes the mark
// under the finger and a drag draws the box around it.
export function PhotoMarks({ url, label, marks, draft, onDraft }: PhotoMarksProps) {
  const t = useTranslations('shop.marks');
  const [shape, setShape] = useState(1 / aspect.thumbnail);
  const size = useRef({ width: 0, height: 0 });
  const start = useRef({ x: 0, y: 0 });
  const drawing = onDraft !== undefined;
  const point = (event: GestureResponderEvent) => pointIn(event.nativeEvent, size.current);
  return (
    <View
      accessible
      role="img"
      aria-label={label}
      onLayout={(event) => {
        size.current = { width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height };
      }}
      onStartShouldSetResponder={() => drawing}
      onMoveShouldSetResponder={() => drawing}
      onResponderGrant={(event) => {
        start.current = point(event);
      }}
      onResponderMove={(event) => onDraft?.(boxBetween(start.current, point(event)))}
      onResponderRelease={(event) => onDraft?.(boxBetween(start.current, point(event)))}
      className="w-full overflow-hidden bg-photo"
      style={{ aspectRatio: shape }}
    >
      <Image
        source={{ uri: url }}
        contentFit="contain"
        pointerEvents="none"
        className="absolute inset-0"
        accessibilityIgnoresInvertColors
        onLoad={(event) => {
          if (event.source.width > 0 && event.source.height > 0) setShape(event.source.width / event.source.height);
        }}
      />
      {marks.map((mark, index) => (
        <View key={mark.id} pointerEvents="none" className={`absolute border-2 ${mark.new ? 'border-primary' : 'border-mark'}`} style={at(mark.region)}>
          <View className="self-start bg-mark px-1">
            <Text variant="tag" tone="inherit" className="text-mark-foreground">
              {String(index + 1)}
            </Text>
          </View>
        </View>
      ))}
      {draft ? (
        <View
          pointerEvents="none"
          accessible
          aria-label={t('box')}
          accessibilityValue={{ text: t('boxAt', { x: Math.round(draft.x * 100), y: Math.round(draft.y * 100), width: Math.round(draft.width * 100), height: Math.round(draft.height * 100) }) }}
          className="absolute border-2 border-dashed border-mark"
          style={at(draft)}
        />
      ) : null}
    </View>
  );
}
