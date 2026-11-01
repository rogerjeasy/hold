import { useLocalSearchParams } from 'expo-router';
import { paypalOrderId } from '@hold/mobile-api';

// What a PayPal confirmation page was opened with: the rental's token, the order to confirm (only one PayPal could have
// named), and whether the renter closed PayPal's page. A malformed order counts as none.
export function useConfirmParams() {
  const { token, order, closed } = useLocalSearchParams<{ token: string; order?: string; closed?: string }>();
  const parsed = paypalOrderId.safeParse(order);
  return { token, orderId: parsed.success ? parsed.data : undefined, closed: closed === '1' };
}
