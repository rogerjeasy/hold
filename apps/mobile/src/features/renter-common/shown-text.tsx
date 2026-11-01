import { View } from 'react-native';
import { useTranslations } from 'use-intl';
import { Button, SampleLabel, Text } from '@/components/ui';

// The code in a text Hold sent: the last line, which a phone reads to offer it, ends with it.
export function codeInText(text: string): string | undefined {
  return /#([0-9]{8})\s*$/.exec(text)?.[1];
}

// A text a demo shop showed here instead of sending (architecture.md section 12.3), labelled so it is never read as
// sent. When it carries a code and the screen has a field for it, one tap puts it there, as the phone would.
export function ShownText({ body, onUseCode }: { body: string; onUseCode?: (code: string) => void }) {
  const t = useTranslations('renterAction.code');
  const code = codeInText(body);
  return (
    <View className="gap-2">
      <SampleLabel />
      <Text variant="small" tone="muted">
        {t('shownLabel')}
      </Text>
      <View className="rounded-lg border border-border bg-muted px-4 py-3">
        <Text selectable>{body}</Text>
      </View>
      {code === undefined || onUseCode === undefined ? null : <Button label={t('useCode', { code })} variant="secondary" onPress={() => onUseCode(code)} className="self-start" />}
    </View>
  );
}
