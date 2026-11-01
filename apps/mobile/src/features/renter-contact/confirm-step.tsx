import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';
import { Button, CodeInput } from '@/components/ui';
import { ActionFailure, CODE_LENGTH, ShownText, useRenterAction } from '@/features/renter-common';
import { useContactWording } from './use-contact-wording';

type ConfirmStepProps = { token: string; phone: string; shown: string | null; onConfirmed: (phone: string) => void };

// The code texted to the number the renter gave. The phone offers it from the text as it arrives; in a demo shop the
// text Hold did not send is shown, with its code a tap away.
export function ConfirmStep({ token, phone, shown, onConfirmed }: ConfirmStepProps) {
  const t = useTranslations('contact');
  const wording = useContactWording();
  const confirm = useRenterAction(token, 'confirm-phone');
  const [code, setCode] = useState('');
  const submit = async () => {
    const answer = await confirm.run({ code });
    if (answer?.ok) onConfirmed(answer.value.phone);
  };
  return (
    <View className="gap-4">
      {shown === null ? null : <ShownText body={shown} onUseCode={setCode} />}
      <CodeInput length={CODE_LENGTH} label={t('codeLabel', { phone })} value={code} onChange={setCode} autoFocus={shown === null} />
      <Button label={t('confirm')} loading={confirm.pending} disabled={code.length < CODE_LENGTH} onPress={() => void submit()} />
      <ActionFailure failed={confirm.failed} wording={wording} />
    </View>
  );
}
