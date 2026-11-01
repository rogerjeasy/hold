import { View } from 'react-native';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui';
import { ActionFailure, useRenterAction } from '@/features/renter-common';
import type { RenterContact } from './contact';
import { ContactStatus } from './contact-status';

type ContactSummaryProps = { token: string; contact: RenterContact; onChange: () => void; refresh: () => void };

// How the renter is reached now, with the one or two changes they can make from here.
export function ContactSummary({ token, contact, onChange, refresh }: ContactSummaryProps) {
  const t = useTranslations('contact');
  const choose = useRenterAction(token, 'choose-email');
  const texting = contact.channel === 'text' && contact.phone !== null;
  const chooseEmail = async () => {
    if ((await choose.run({}))?.ok) refresh();
  };
  return (
    <View className="gap-4">
      <ContactStatus contact={contact} />
      {texting ? (
        <View className="gap-3">
          {contact.confirmed ? null : <Button label={t('confirmNumber')} onPress={onChange} />}
          <Button label={t('changeNumber')} variant="secondary" onPress={onChange} />
          <Button label={t('emailInstead')} icon="mail" variant="secondary" loading={choose.pending} onPress={() => void chooseEmail()} />
        </View>
      ) : (
        <Button label={t('textInstead')} icon="message" onPress={onChange} />
      )}
      <ActionFailure failed={choose.failed} />
    </View>
  );
}
