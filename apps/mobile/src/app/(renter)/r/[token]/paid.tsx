import { FeeConfirmScreen } from '@/features/renter-pay/fee-confirm-screen';
import { NoOrder } from '@/features/renter-pay/no-order';
import { useConfirmParams } from '@/features/renter-pay/use-confirm-params';

// Back from PayPal after approving the rental fee.
export default function PaidRoute() {
  const { token, orderId, closed } = useConfirmParams();
  return orderId === undefined ? <NoOrder /> : <FeeConfirmScreen token={token} orderId={orderId} closed={closed} />;
}
