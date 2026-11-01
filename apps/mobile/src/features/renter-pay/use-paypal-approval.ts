import { useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { PAYPAL_RETURN_LINK } from '@hold/mobile-api';
import { useApi } from '@/api';
import { actAsRenter, type ActionFailed } from '@/features/renter-common';

// What a renter approves in PayPal: the rental fee, the hold at pickup (with the fee for a walk-in), more days.
export type PayPalStart = 'pay-fee' | 'approve-hold' | 'pay-extension';

// Approving a payment from the phone (architecture.md section 13.8). Hold starts the order for the app, and PayPal's
// own page opens in an in-app browser session that closes when PayPal hands the renter back to hold://paypal-return.
// However the session ends (approved, cancelled, swiped away), the caller is handed the order to confirm, because only
// the server's read of the order from PayPal says whether it was approved. `closed` says the renter left PayPal's page
// without it sending them back, so a "not approved" can be worded as their choice.
export function usePayPalApproval(token: string, start: PayPalStart, onReturn: (orderId: string, closed: boolean) => void) {
  const api = useApi();
  const [opening, setOpening] = useState(false);
  const [failed, setFailed] = useState<ActionFailed | undefined>(undefined);
  const open = async () => {
    if (opening) return;
    setOpening(true);
    setFailed(undefined);
    const started = await actAsRenter(api, token, start, { returnTo: 'app' });
    if (!started.ok) {
      setFailed(started);
      setOpening(false);
      return;
    }
    let returned = false;
    try {
      returned = (await WebBrowser.openAuthSessionAsync(started.value.approvalUrl, PAYPAL_RETURN_LINK)).type === 'success';
    } catch {
      // The session could not open or broke off: the order is still confirmed, and the server says what PayPal holds.
    }
    setOpening(false);
    onReturn(started.value.orderId, !returned);
  };
  return { open, opening, failed };
}
