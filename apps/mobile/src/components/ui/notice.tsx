import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ColorToken } from '@hold/design-tokens';
import { useTheme } from '@/theme';
import { Icon, type IconName } from './icon';
import { Text } from './text';

// A tone adds a coloured edge and an icon. The title always says what the colour means, so colour is never the only
// sign. Mirrors the web's Notice.
type Tone = 'neutral' | 'warning' | 'destructive' | 'success';

const LOOK: Readonly<Record<Tone, { edge: string; icon: IconName; color: ColorToken }>> = {
  neutral: { edge: '', icon: 'info', color: 'primary' },
  warning: { edge: 'border-l-4 border-l-warning', icon: 'warning', color: 'warning' },
  destructive: { edge: 'border-l-4 border-l-destructive', icon: 'error', color: 'destructive' },
  success: { edge: 'border-l-4 border-l-success', icon: 'success', color: 'success' },
};

type NoticeProps = {
  title: string;
  body: string;
  tone?: Tone;
  // A notice that answers something the person did is announced; one that was always there is not.
  announced?: boolean;
  children?: ReactNode;
};

export function Notice({ title, body, tone = 'neutral', announced = false, children }: NoticeProps) {
  const { color } = useTheme();
  const look = LOOK[tone];
  return (
    <View
      // An announced notice is one element, read title then body.
      accessible={announced}
      role={announced ? 'alert' : undefined}
      accessibilityLiveRegion={announced ? 'polite' : 'none'}
      className={`flex-row gap-3 border border-border-strong bg-card p-4 ${look.edge}`}
    >
      <Icon name={look.icon} color={color[look.color]} size={20} />
      <View className="min-w-0 flex-1 gap-1">
        <Text variant="bodyStrong" selectable>
          {title}
        </Text>
        <Text tone="muted" selectable>
          {body}
        </Text>
        {children}
      </View>
    </View>
  );
}
