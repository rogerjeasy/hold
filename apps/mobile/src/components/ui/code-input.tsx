import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useTranslations } from 'use-intl';
import { Text } from './text';

type CodeInputProps = {
  // How many digits Hold sends (eight for a claim's code today); the screen that asks knows.
  length: number;
  value: string;
  onChange: (code: string) => void;
  error?: string;
  autoFocus?: boolean;
  // Which code, where a screen asks for more than one kind ("the code we texted to …"). A one-time code otherwise.
  label?: string;
};

// The one-time code a renter types to accept or contest a claim. One real field, so the phone can offer the code
// from a text message and a screen reader reads one control; the boxes are only how it looks.
export function CodeInput({ length, value, onChange, error, autoFocus = false, label }: CodeInputProps) {
  const t = useTranslations('code');
  const name = label ?? t('label');
  const [focused, setFocused] = useState(autoFocus);
  const note = error ?? t('hint', { length });
  return (
    <View className="gap-2">
      <Text variant="label" tone="muted" aria-hidden>
        {name}
      </Text>
      <View>
        <View className="flex-row gap-1.5" aria-hidden>
          {Array.from({ length }, (_, index) => {
            const next = focused && index === Math.min(value.length, length - 1);
            return (
              <View
                key={index}
                className={`min-h-touch flex-1 items-center justify-center border bg-card ${error ? 'border-destructive' : next ? 'border-2 border-primary' : 'border-input'} ${index === length / 2 ? 'ml-2' : ''}`}
              >
                <Text variant="code">{value[index] ?? ''}</Text>
              </View>
            );
          })}
        </View>
        <TextInput
          value={value}
          // A pasted code may carry spaces or dashes; only its digits count.
          onChangeText={(text) => onChange(text.replace(/\D/g, '').slice(0, length))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoFocus={autoFocus}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete={process.env.EXPO_OS === 'android' ? 'sms-otp' : 'one-time-code'}
          caretHidden
          aria-label={name}
          accessibilityHint={note}
          className="absolute inset-0 text-transparent opacity-0"
        />
      </View>
      <Text variant="small" tone={error ? 'destructive' : 'muted'} aria-hidden={!error} role={error ? 'alert' : undefined}>
        {note}
      </Text>
    </View>
  );
}
