import { View } from 'react-native';
import { useTranslations } from 'use-intl';
import { Icon, StatusPill, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import type { RenterContact } from './contact';

// How the renter is reached now, said plainly: by email, or by text to the masked number and whether it is confirmed.
export function ContactStatus({ contact }: { contact: RenterContact }) {
  const t = useTranslations('contact');
  const { color } = useTheme();
  const texting = contact.channel === 'text' && contact.phone !== null;
  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
        <View className="min-w-0 shrink flex-row items-center gap-2">
          <Icon name={texting ? 'message' : 'mail'} color={color.primary} size={18} />
          <Text variant="bodyStrong" selectable className="shrink">
            {texting ? t('byText', { phone: contact.phone ?? '' }) : t('byEmail')}
          </Text>
        </View>
        {texting ? <StatusPill label={contact.confirmed ? t('confirmed') : t('notConfirmed')} tone={contact.confirmed ? 'success' : 'neutral'} /> : null}
      </View>
      <Text tone="muted">{texting ? (contact.confirmed ? t('textBody') : t('notConfirmedBody')) : t('emailBody')}</Text>
    </View>
  );
}
