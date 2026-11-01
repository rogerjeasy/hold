import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';
import { Button, Text } from '@/components/ui';
import { CodeDelivery, useRenterAction } from '@/features/renter-common';
import { PhoneForm, type PhoneCodeSent } from './phone-form';
import { useContactWording } from './use-contact-wording';

// Once the hold is placed, a new number starts with a code sent where the renter's codes go now: the phone they
// confirmed, or the email PayPal gave. Whoever has only the link cannot get past this, so the code is never offered
// by email instead.
export function ChangeStep({ token, onSent }: { token: string; onSent: (sent: PhoneCodeSent) => void }) {
  const t = useTranslations('contact');
  const wording = useContactWording();
  const request = useRenterAction(token, 'send-contact-change-code');
  const [code, setCode] = useState('');
  return (
    <View className="gap-4">
      <View className="gap-3">
        <Text>{t('changeLead')}</Text>
        <Button label={t('sendChangeCode')} icon="send" variant={request.done ? 'secondary' : 'primary'} loading={request.pending} onPress={() => void request.run({})} className="self-start" />
        <CodeDelivery
          delivery={request.done}
          failed={request.failed}
          pending={request.pending}
          onUseCode={setCode}
          emailWords={{ sent: t('changeCodeEmailed'), sandbox: t('changeCodeEmailed') }}
          wording={wording}
        />
      </View>
      {request.done ? <PhoneForm token={token} change={{ code, onCodeChange: setCode }} onSent={onSent} /> : null}
    </View>
  );
}
