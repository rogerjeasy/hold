import type { ReactNode } from 'react';
import { ActivityIndicator, Linking, View } from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import { useTranslations } from 'use-intl';
import { Button, Icon, Screen, Text } from '@/components/ui';
import { useTheme } from '@/theme';

// The camera is shown only once the person has allowed it. Hold explains why first and asks only when the person
// taps; it never fires the system prompt on its own. Someone who said no is sent to Settings, and told the shop can
// take the photographs instead, so no one is stuck.
// `reason` says what this camera is for, in the caller's words; photographing the item is the default.
export function CameraPermissionGate({ children, reason }: { children: ReactNode; reason?: string }) {
  const t = useTranslations('camera.permission');
  const { color } = useTheme();
  const [permission, request] = useCameraPermissions();

  if (permission === null) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color={color.mutedForeground} aria-label={t('checking')} />
      </View>
    );
  }
  if (permission.granted) return <>{children}</>;

  const canAsk = permission.canAskAgain;
  return (
    <Screen
      footer={
        canAsk ? (
          <Button label={t('allow')} icon="camera" onPress={() => void request()} />
        ) : (
          <Button label={t('openSettings')} icon="settings" onPress={() => void Linking.openSettings()} />
        )
      }
    >
      <View className="flex-1 justify-center gap-4">
        <Icon name="camera" color={color.primary} size={40} />
        <Text variant="title" role="heading">
          {canAsk ? t('title') : t('deniedTitle')}
        </Text>
        <Text tone="muted">{canAsk ? (reason ?? t('body')) : t('deniedBody')}</Text>
      </View>
    </Screen>
  );
}
