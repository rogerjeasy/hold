import { TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from '@/theme';
import { Text } from './text';

type FieldProps = Omit<TextInputProps, 'style' | 'placeholderTextColor'> & {
  label: string;
  hint?: string;
  // What is wrong, in words. It replaces the hint, and is read with the field.
  error?: string;
};

// A labelled text field. The label sits above it, so it stays visible while typing; the hint or the problem below.
export function Field({ label, hint, error, multiline, ...input }: FieldProps) {
  const { color } = useTheme();
  const note = error ?? hint;
  return (
    <View className="gap-2">
      <Text variant="label" tone="muted" aria-hidden>
        {label}
      </Text>
      <TextInput
        {...input}
        multiline={multiline}
        aria-label={label}
        accessibilityHint={note}
        placeholderTextColor={color.mutedForeground}
        className={`min-h-touch border bg-card px-3 py-2.5 font-body text-body text-foreground ${error ? 'border-destructive' : 'border-input'} ${multiline ? 'min-h-24' : ''}`}
      />
      {note === undefined ? null : (
        <Text variant="small" tone={error ? 'destructive' : 'muted'} aria-hidden={!error} role={error ? 'alert' : undefined}>
          {note}
        </Text>
      )}
    </View>
  );
}
