import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslations } from 'use-intl';
import type { CaptureSessionView } from '@hold/mobile-api';
import { ConditionCapture } from '@/components/camera';
import { Icon } from '@/components/ui';
import { useTheme } from '@/theme';

// The camera for one view, full screen: which view of how many, the handover's photograph of it at a return, and a
// way back to the list.
export function CaptureCamera({ session, view, onAccept, onClose }: { session: CaptureSessionView; view: string; onAccept: (uri: string) => void; onClose: () => void }) {
  const t = useTranslations('shop.capture');
  const { color } = useTheme();
  const insets = useSafeAreaInsets();
  const index = session.plan.findIndex((each) => each.key === view);
  const planned = session.plan[index];
  const label = planned?.label ?? view;
  const ghostUrl = session.kind === 'return' ? session.ghost.find((each) => each.view === view)?.url : undefined;
  return (
    <View className="flex-1 bg-photo">
      <ConditionCapture
        hint={t('hint', { position: index + 1, total: session.plan.length, view: label })}
        ghost={ghostUrl ? { uri: ghostUrl, view: label } : undefined}
        onAccept={(photo) => onAccept(photo.uri)}
      />
      <Pressable
        role="button"
        aria-label={t('close')}
        onPress={onClose}
        hitSlop={8}
        className="absolute min-h-touch min-w-touch items-center justify-center rounded-full bg-photo-scrim active:opacity-70"
        style={{ top: insets.top + 8, left: insets.left + 12 }}
      >
        <Icon name="close" color={color.photoForeground} size={22} />
      </Pressable>
    </View>
  );
}
