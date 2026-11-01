import { ExtendedScreen } from '@/features/renter-extend/extended-screen';
import { NoOrder } from '@/features/renter-pay/no-order';
import { useConfirmParams } from '@/features/renter-pay/use-confirm-params';

// Back from PayPal after paying for more days.
export default function ExtendedRoute() {
  const { token, orderId, closed } = useConfirmParams();
  return orderId === undefined ? <NoOrder /> : <ExtendedScreen key={orderId} token={token} orderId={orderId} closed={closed} />;
}
