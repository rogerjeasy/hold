import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';
import { Button, Screen } from '@/components/ui';
import { Confirmed, LoadedScreen, ShownText, useRenterView } from '@/features/renter-common';
import { ChangeStep } from './change-step';
import type { RenterContact } from './contact';
import { ConfirmStep } from './confirm-step';
import { ContactSummary } from './contact-summary';
import { PhoneForm, type PhoneCodeSent } from './phone-form';

type Step =
  | { readonly kind: 'summary' }
  | { readonly kind: 'choosing' }
  | { readonly kind: 'changing' }
  | { readonly kind: 'confirming'; readonly phone: string; readonly shown: string | null }
  | { readonly kind: 'done'; readonly phone: string };

// How Hold reaches the renter, chosen on their own phone (architecture.md section 12.3): by email, or by text to a
// number they confirm with a code. Before the hold is placed they set it freely; after, a new number first needs a code
// from the channel trusted now. The web's panel, as its own page.
export function ContactScreen({ token }: { token: string }) {
  const t = useTranslations('contact');
  const { state, retry } = useRenterView(token, 'rental');
  return (
    <LoadedScreen state={state} onRetry={retry} empty={{ title: t('title'), body: t('unavailable') }} isEmpty={(rental) => rental.contact === null}>
      {(rental) => (rental.contact === null ? null : <ContactFlow token={token} contact={rental.contact} refresh={retry} />)}
    </LoadedScreen>
  );
}

function ContactFlow({ token, contact, refresh }: { token: string; contact: RenterContact; refresh: () => void }) {
  const t = useTranslations('contact');
  const [step, setStep] = useState<Step>({ kind: 'summary' });
  const settle = (phone: string) => {
    setStep({ kind: 'done', phone });
    refresh();
  };
  const onSent = (sent: PhoneCodeSent) => (sent.confirmed ? settle(sent.phone) : setStep({ kind: 'confirming', phone: sent.phone, shown: sent.shown }));
  const settled = step.kind === 'summary' || step.kind === 'done';
  return (
    <Screen>
      {step.kind === 'done' ? <Confirmed text={t('confirmedNow', { phone: step.phone })} /> : null}
      {settled ? <ContactSummary token={token} contact={contact} onChange={() => setStep({ kind: contact.locked ? 'changing' : 'choosing' })} refresh={refresh} /> : null}
      {step.kind === 'choosing' ? <PhoneForm token={token} onSent={onSent} /> : null}
      {step.kind === 'changing' ? <ChangeStep token={token} onSent={onSent} /> : null}
      {step.kind === 'confirming' ? <ConfirmStep token={token} phone={step.phone} shown={step.shown} onConfirmed={settle} /> : null}
      {settled ? null : <Button label={t('cancel')} variant="secondary" onPress={() => setStep({ kind: 'summary' })} className="self-start" />}
      {settled && contact.shown.length > 0 ? (
        <View className="gap-4 border-t border-border pt-4">
          {contact.shown.map((text) => (
            <ShownText key={text.id} body={text.body} />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}
