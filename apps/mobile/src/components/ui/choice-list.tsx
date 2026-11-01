import { Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/theme';
import { Icon } from './icon';
import { Text } from './text';

type Choice<Value extends string> = { readonly value: Value; readonly label: string };

// One choice of a few, as rows on a card with a tick on the chosen one: a radio group a screen reader reads as one.
export function ChoiceList<Value extends string>({ label, choices, value, onChange }: { label: string; choices: readonly Choice<Value>[]; value: Value | undefined; onChange: (value: Value) => void }) {
  const { color } = useTheme();
  return (
    <View className="gap-2">
      <Text variant="label" tone="muted" aria-hidden>
        {label}
      </Text>
      <View role="radiogroup" aria-label={label} className="border border-border bg-card">
        {choices.map((choice, index) => {
          const chosen = choice.value === value;
          return (
            <Pressable
              key={choice.value}
              role="radio"
              aria-label={choice.label}
              aria-checked={chosen}
              onPress={() => {
                if (!chosen) void Haptics.selectionAsync();
                onChange(choice.value);
              }}
              className={`min-h-touch flex-row items-center gap-3 px-4 py-3 active:bg-accent ${index === 0 ? '' : 'border-t border-border'}`}
            >
              <View className="min-w-0 flex-1">
                <Text variant={chosen ? 'bodyStrong' : 'body'}>{choice.label}</Text>
              </View>
              {chosen ? <Icon name="check" color={color.primary} size={20} /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
