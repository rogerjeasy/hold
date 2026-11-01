import { useState } from 'react';
import * as Haptics from 'expo-haptics';
import type { CaptureSessionView, StaffActionOutput } from '@hold/mobile-api';
import { useStaffAction } from '@/features/shop-session/use-staff-action';

export type Sealed = { readonly kind: 'handover'; readonly value: StaffActionOutput<'seal-handover'> } | { readonly kind: 'return'; readonly value: StaffActionOutput<'seal-return'> };

// Sealing fixes the photographs and chains them to the item's history (architecture.md section 9.2). Hold checks that
// every needed view is there; the phone only offers it once they look done.
export function useSeal(session: CaptureSessionView) {
  const { act, pending, refusal } = useStaffAction();
  const [sealed, setSealed] = useState<Sealed | undefined>(undefined);
  const seal = async () => {
    const input = { sessionId: session.id };
    const answer = session.kind === 'handover' ? await act('seal-handover', input) : await act('seal-return', input);
    if (!answer.ok) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSealed(session.kind === 'handover' ? { kind: 'handover', value: answer.value as StaffActionOutput<'seal-handover'> } : { kind: 'return', value: answer.value as StaffActionOutput<'seal-return'> });
  };
  return { seal, sealing: pending !== undefined, refusal, sealed };
}
