import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslations } from 'use-intl';
import { Button, Panel } from '@/components/ui';
import type { RenterContact } from './contact';
import { ContactStatus } from './contact-status';

// How Hold reaches the renter, on the rental and the hold, with the way to the page where they choose.
export function ContactPanel({ token, contact }: { token: string; contact: RenterContact }) {
  const t = useTranslations('contact');
  return (
    <Panel title={t('title')}>
      <View className="gap-4 p-4">
        <ContactStatus contact={contact} />
        <Button label={t('open')} icon="message" variant="secondary" onPress={() => router.push(`/r/${token}/contact`)} className="self-start" />
      </View>
    </Panel>
  );
}
