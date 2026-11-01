import { useTranslations } from 'use-intl';
import { Notice, Screen } from '@/components/ui';

// A confirmation page opened without an order to confirm: nothing to ask PayPal, and nothing is changed.
export function NoOrder() {
  const t = useTranslations('loadState.link_invalid');
  return (
    <Screen>
      <Notice tone="warning" title={t('title')} body={t('body')} />
    </Screen>
  );
}
