import { View } from 'react-native';
import { useTranslations } from 'use-intl';
import { parseAmount } from '@hold/domain';
import { ChoiceList, Field, MoneyText, Text } from '@/components/ui';
import {  } from '@/features/renter-common';

export type AdvocateChoice = 'hold' | 'assistant';

type AdvocateFieldsProps = {
  currency: string;
  // The renter's own assistant connected to this rental, by the name it gave itself; null when none is.
  assistantName: string | null;
  advocate: AdvocateChoice;
  onAdvocateChange: (advocate: AdvocateChoice) => void;
  highest: string;
  onHighestChange: (highest: string) => void;
  highestError?: string;
};

// What the renter gives an advocate (extensions.md section 9.4): who argues it, and the most they will pay. The amount
// is the one a renter types; it is read back as money here so they see what they wrote, and the server bounds it by
// the claim (AGENTS.md section 6). The shop never sees it, and the advocate asks before agreeing.
export function AdvocateFields({ currency, assistantName, advocate, onAdvocateChange, highest, onHighestChange, highestError }: AdvocateFieldsProps) {
  const t = useTranslations('negotiation.advocate');
  const amount = parseAmount(highest, currency);
  return (
    <View className="gap-4">
      <Text tone="muted">{t('guidance')}</Text>
      {assistantName === null ? null : (
        <View className="gap-2">
          <ChoiceList<AdvocateChoice>
            label={t('who')}
            value={advocate}
            onChange={onAdvocateChange}
            choices={[
              { value: 'hold', label: t('hold') },
              { value: 'assistant', label: t('assistant', { name: assistantName }) },
            ]}
          />
          <Text variant="small" tone="muted">
            {t('assistantGuidance')}
          </Text>
        </View>
      )}
      <Field label={t('highest', { currency })} value={highest} onChangeText={onHighestChange} keyboardType="decimal-pad" maxLength={12} error={highestError} />
      {amount === undefined ? null : (
        <View className="gap-1 border-l-2 border-primary pl-3">
          <Text variant="small" tone="muted">
            {t('upTo')}
          </Text>
          <MoneyText money={amount} variant="figure" />
          <Text variant="small" tone="muted">
            {t('asksFirst')}
          </Text>
        </View>
      )}
    </View>
  );
}
