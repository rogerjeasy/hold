import { ActivityIndicator, Pressable, View } from 'react-native';
import { useTheme } from '@/theme';
import { Icon, type IconName } from './icon';
import { Text, type TextTone } from './text';

// primary: the one main action on a screen. secondary: anything beside it. destructive: an action that removes or
// refuses, outlined so it never reads as the way forward.
const VARIANT = {
  primary: { box: 'bg-primary active:opacity-80', tone: 'onPrimary', spinner: 'primaryForeground' },
  secondary: { box: 'border border-border-strong bg-card active:bg-accent', tone: 'default', spinner: 'foreground' },
  destructive: { box: 'border border-destructive bg-card active:bg-accent', tone: 'destructive', spinner: 'destructive' },
} as const satisfies Record<string, { box: string; tone: TextTone; spinner: 'primaryForeground' | 'foreground' | 'destructive' }>;

export type ButtonVariant = keyof typeof VARIANT;

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  // The action is running: the button keeps its label, shows a spinner and cannot be pressed again.
  loading?: boolean;
  disabled?: boolean;
  // Layout only (width, margins). A different look is a new variant.
  className?: string;
};

export function Button({ label, onPress, variant = 'primary', icon, loading = false, disabled = false, className }: ButtonProps) {
  const { color } = useTheme();
  const look = VARIANT[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      role="button"
      aria-label={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      className={['min-h-touch flex-row items-center justify-center gap-2 rounded-lg px-5 py-3', look.box, disabled ? 'opacity-50' : '', className].join(' ')}
    >
      {loading ? <ActivityIndicator color={color[look.spinner]} /> : icon ? <Icon name={icon} color={color[look.spinner]} size={20} /> : null}
      <View className="shrink">
        <Text variant="button" tone={look.tone} className="text-center">
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
