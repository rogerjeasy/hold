import { router } from 'expo-router';
import { useTranslations } from 'use-intl';
import { Button, Screen, Text } from '@/components/ui';

export default function NotFound() {
  const t = useTranslations('errors.notFound');
  return (
    <Screen footer={<Button label={t('home')} onPress={() => router.replace('/')} />}>
      <Text variant="title" role="heading">
        {t('title')}
      </Text>
      <Text tone="muted">{t('body')}</Text>
    </Screen>
  );
}
