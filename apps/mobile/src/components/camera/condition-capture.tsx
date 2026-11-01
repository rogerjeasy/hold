import { useState } from 'react';
import { Pressable, useWindowDimensions, View, type LayoutRectangle } from 'react-native';
import { CameraView } from 'expo-camera';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslations } from 'use-intl';
import { aspect } from '@hold/design-tokens';
import { Button, Icon, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { CameraPermissionGate } from './camera-permission';
import type { Photo } from './downscale';
import { useCapture } from './use-capture';

// The earlier photograph shows through this much, as on the web, enough to line up with and not enough to hide the item.
const GHOST_OPACITY = 0.4;

type ConditionCaptureProps = {
  // The handover photograph of the same view, so the return photograph lines up with it, and what that view is.
  ghost?: { uri: string; view: string };
  // What the person should photograph, in the caller's words. The alignment hint is used when there is a ghost.
  hint?: string;
  onAccept: (photo: Photo) => void | Promise<void>;
};

// Taking one condition photograph, at handover or return, by staff or by a renter: aim (over the earlier photograph,
// when there is one), take, look at it, retake or use it. The used photograph is downscaled before it is handed over.
// Full screen, so its route hides the header.
export function ConditionCapture(props: ConditionCaptureProps) {
  return (
    <CameraPermissionGate>
      <Capture {...props} />
    </CameraPermissionGate>
  );
}

function Capture({ ghost, hint, onAccept }: ConditionCaptureProps) {
  const t = useTranslations('camera.capture');
  const { color } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const [ghostShown, setGhostShown] = useState(true);
  const [area, setArea] = useState<Pick<LayoutRectangle, 'width' | 'height'>>({ width: 0, height: 0 });
  // The camera's own shape (4:3), as large as the area allows, so the preview, the photograph and the earlier
  // photograph line up exactly at any size and orientation.
  const shape = landscape ? aspect.thumbnail : 1 / aspect.thumbnail;
  const frameWidth = Math.min(area.width, area.height * shape);
  const { camera, stage, take, retake, use } = useCapture(onAccept);
  const reviewing = stage.name === 'reviewing' || stage.name === 'preparing' ? stage.photo : undefined;
  const message = stage.name === 'aiming' && stage.failed ? t('failed') : reviewing ? t('review') : (hint ?? (ghost ? t('alignHint') : undefined));

  return (
    <View
      className={`flex-1 bg-photo ${landscape ? 'flex-row' : ''}`}
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }}
    >
      <View className="flex-1 items-center justify-center p-3" onLayout={(event) => setArea({ width: event.nativeEvent.layout.width - 24, height: event.nativeEvent.layout.height - 24 })}>
        <View className="overflow-hidden bg-photo" style={{ width: frameWidth, height: frameWidth / shape }}>
          {reviewing ? (
            <Image source={{ uri: reviewing.uri }} contentFit="cover" className="flex-1" accessibilityIgnoresInvertColors />
          ) : (
            <>
              <CameraView ref={camera} className="flex-1" facing="back" ratio="4:3" animateShutter={false} />
              {ghost && ghostShown ? (
                <Image
                  source={{ uri: ghost.uri }}
                  contentFit="cover"
                  accessible
                  aria-label={t('ghostImage', { view: ghost.view })}
                  pointerEvents="none"
                  className="absolute inset-0"
                  style={{ opacity: GHOST_OPACITY }}
                />
              ) : null}
            </>
          )}
        </View>
      </View>

      <View className={`items-center justify-center gap-4 px-4 py-4 ${landscape ? 'w-56' : ''}`}>
        {message ? (
          <Text tone="onPhoto" className="text-center" role={stage.name === 'aiming' && stage.failed ? 'alert' : undefined}>
            {message}
          </Text>
        ) : null}
        {reviewing ? (
          <View className={`w-full gap-3 ${landscape ? '' : 'flex-row'}`}>
            <Button label={t('retake')} icon="retake" variant="secondary" onPress={retake} disabled={stage.name === 'preparing'} className={landscape ? '' : 'flex-1'} />
            <Button label={t('use')} icon="check" onPress={() => void use()} loading={stage.name === 'preparing'} className={landscape ? '' : 'flex-1'} />
          </View>
        ) : (
          <View className={`w-full items-center justify-between ${landscape ? 'flex-col-reverse gap-6' : 'flex-row'}`}>
            {ghost ? (
              <Pressable
                role="button"
                aria-label={ghostShown ? t('ghostHide') : t('ghostShow')}
                onPress={() => setGhostShown((shown) => !shown)}
                className="min-h-touch min-w-touch items-center justify-center rounded-full active:opacity-70"
              >
                <Icon name={ghostShown ? 'ghost' : 'ghostOff'} color={color.photoForeground} size={26} />
              </Pressable>
            ) : (
              <View className="min-w-touch" />
            )}
            <Pressable
              role="button"
              aria-label={t('shutter')}
              accessibilityState={{ busy: stage.name === 'taking', disabled: stage.name === 'taking' }}
              disabled={stage.name === 'taking'}
              onPress={() => void take()}
              className="h-20 w-20 items-center justify-center rounded-full border-4 border-photo-foreground active:opacity-70"
            >
              <View className="h-16 w-16 rounded-full bg-photo-foreground" />
            </Pressable>
            <View className="min-w-touch" />
          </View>
        )}
      </View>
    </View>
  );
}
