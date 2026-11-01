import { View } from 'react-native';
import { useTranslations } from 'use-intl';
import { Button, Text } from '@/components/ui';
import { RenterRefusal } from '@/features/renter-rental/renter-refusal';
import { usePayPalApproval, type PayPalStart } from './use-paypal-approval';

type PayPalButtonProps = {
  token: string;
  start: PayPalStart;
  // The button says the amount; `agree` says what approving it means.
  label: string;
  agree: string;
  onReturn: (orderId: string, closed: boolean) => void;
};

// A screen's main action when the renter is to approve something in PayPal. No amount is sent: Hold reads it from the
// rental and PayPal shows it. Why Hold would not start it is said right above the button.
export function PayPalButton({ token, start, label, agree, onReturn }: PayPalButtonProps) {
  const t = useTranslations('pay');
  const paypal = usePayPalApproval(token, start, onReturn);
  return (
    <View className="gap-3">
      {paypal.failed ? <RenterRefusal failed={paypal.failed} /> : null}
      <Text variant="small" tone="muted">
        {`${agree} ${t('secure')}`}
      </Text>
      <Button label={paypal.opening ? t('paying') : label} icon="payment" loading={paypal.opening} onPress={() => void paypal.open()} />
    </View>
  );
}
