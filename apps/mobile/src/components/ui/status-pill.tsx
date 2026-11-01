import { View } from 'react-native';
import { Text, type TextTone } from './text';

// A short state beside a rental or a claim ("Overdue", "Being checked"). The word carries the meaning; the colour
// only repeats it.
type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'destructive';

const LOOK: Readonly<Record<Tone, { border: string; text: TextTone }>> = {
  neutral: { border: 'border-border-strong', text: 'muted' },
  primary: { border: 'border-primary', text: 'primary' },
  success: { border: 'border-success', text: 'success' },
  warning: { border: 'border-warning', text: 'warning' },
  destructive: { border: 'border-destructive', text: 'destructive' },
};

export function StatusPill({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  return (
    <View className={`self-start border px-2 py-0.5 ${LOOK[tone].border}`}>
      <Text variant="tag" tone={LOOK[tone].text}>
        {label}
      </Text>
    </View>
  );
}
