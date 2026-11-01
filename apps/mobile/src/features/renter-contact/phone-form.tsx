import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';
import type { RenterActionOutput } from '@hold/mobile-api';
import { Button, CodeInput, Field } from '@/components/ui';
import { ActionFailure, CODE_LENGTH, useRenterAction } from '@/features/renter-common';
import { useCallingCode } from './use-calling-code';
import { useContactWording } from './use-contact-wording';

export type PhoneCodeSent = RenterActionOutput<'send-phone-code'>;

type PhoneFormProps = {
  token: string;
  // Once the hold is placed: the code first sent where the renter's codes go now, without which the number cannot move.
  change?: { readonly code: string; readonly onCodeChange: (code: string) => void };
  onSent: (sent: PhoneCodeSent) => void;
};

// The renter's number, its country code filled in from the phone's region, and a code texted to it.
export function PhoneForm({ token, change, onSent }: PhoneFormProps) {
  const t = useTranslations('contact');
  const wording = useContactWording();
  // The country code starts the field; the renter's typing is never replaced.
  const prefix = useCallingCode();
  const [phone, setPhone] = useState(prefix);
  const send = useRenterAction(token, 'send-phone-code');
  const submit = async () => {
    const answer = await send.run({ phone, changeCode: change?.code ?? '' });
    if (answer?.ok) onSent(answer.value);
  };
  return (
    <View className="gap-4">
      {change === undefined ? null : <CodeInput length={CODE_LENGTH} label={t('changeCodeLabel')} value={change.code} onChange={change.onCodeChange} />}
      <Field
        label={change === undefined ? t('phoneLabel') : t('newPhoneLabel')}
        hint={t('privacy')}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        maxLength={40}
      />
      <Button label={t('sendCode')} icon="message" loading={send.pending} disabled={change !== undefined && change.code.length < CODE_LENGTH} onPress={() => void submit()} />
      <ActionFailure failed={send.failed} wording={wording} />
    </View>
  );
}
