import { Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTranslations } from 'use-intl';
import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/theme';

type DayStepperProps = { days: number; max: number; newEnd: string; onChange: (days: number) => void };

// How many more days, one tap at a time, between one and the most the shop allows, with the new return time it makes
// said right under it. The count is read as an adjustable value.
export function DayStepper({ days, max, newEnd, onChange }: DayStepperProps) {
  const t = useTranslations('extend');
  const { color } = useTheme();
  const step = (by: number) => {
    void Haptics.selectionAsync();
    onChange(Math.min(max, Math.max(1, days + by)));
  };
  return (
    <View className="gap-3">
      <Text variant="label" tone="muted">
        {t('form.quick')}
      </Text>
      <View className="flex-row items-center border border-border-strong bg-card">
        <StepButton label={t('form.fewer')} icon="minus" disabled={days <= 1} onPress={() => step(-1)} color={color.foreground} />
        <View
          className="min-w-0 flex-1 items-center gap-0.5 border-x border-border py-3"
          accessible
          role="spinbutton"
          aria-label={t('form.quick')}
          aria-valuenow={days}
          aria-valuemin={1}
          aria-valuemax={max}
          aria-valuetext={t('form.days', { count: days })}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(event) => step(event.nativeEvent.actionName === 'increment' ? 1 : -1)}
        >
          <Text variant="figure">{t('form.days', { count: days })}</Text>
          <Text variant="small" tone="muted" className="text-center">
            {newEnd}
          </Text>
        </View>
        <StepButton label={t('form.more')} icon="plus" disabled={days >= max} onPress={() => step(1)} color={color.foreground} />
      </View>
    </View>
  );
}

function StepButton({ label, icon, disabled, onPress, color }: { label: string; icon: 'plus' | 'minus'; disabled: boolean; onPress: () => void; color: string }) {
  return (
    <Pressable
      role="button"
      aria-label={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-touch w-16 items-center justify-center self-stretch active:bg-accent ${disabled ? 'opacity-40' : ''}`}
    >
      <Icon name={icon} color={color} size={24} />
    </Pressable>
  );
}
