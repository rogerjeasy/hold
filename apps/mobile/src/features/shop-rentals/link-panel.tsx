import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslations } from 'use-intl';
import type { RentalView } from '@hold/mobile-api';
import { Button, Notice, Panel, Text } from '@/components/ui';
import { RefusalNotice } from '@/features/shop-session/refusal';
import { useStaffAction } from '@/features/shop-session/use-staff-action';

// The renter's link: shown as a code for their phone to scan, or sent again the way the renter is reached, by text
// or by email. Hold knows which; a renter it cannot reach is a refusal, shown in words.
export function LinkPanel({ rental }: { rental: RentalView }) {
  const t = useTranslations('shop.rental.link');
  const { act, pending, refusal } = useStaffAction();
  const [sent, setSent] = useState<{ readonly via: 'text' | 'email'; readonly to: string } | undefined>(undefined);
  return (
    <Panel title={t('title')}>
      <View className="gap-3 p-4">
        <Text tone="muted">{t('body')}</Text>
        <Button icon="qr" variant="secondary" label={t('show')} onPress={() => router.push({ pathname: '/shop/rental/[rentalId]/link', params: { rentalId: rental.id } })} />
        <Button
          icon="mail"
          variant="secondary"
          label={t('send')}
          loading={pending !== undefined}
          onPress={async () => {
            const answer = await act('send-renter-link', { rentalId: rental.id });
            if (answer.ok) setSent(answer.value);
          }}
        />
        {sent ? <Notice tone="success" announced title={t('title')} body={sent.via === 'text' ? t('sentText', { to: sent.to }) : t('sentEmail', { to: sent.to })} /> : null}
        {refusal ? <RefusalNotice refusal={refusal} /> : null}
      </View>
    </Panel>
  );
}
