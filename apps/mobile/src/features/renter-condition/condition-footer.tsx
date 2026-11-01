import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui';
import { useRenterAction } from '@/features/renter-common';
import { RenterRefusal } from '@/features/renter-rental/renter-refusal';

type ConditionFooterProps = {
  token: string;
  adding: boolean;
  // The renter added a photograph to at least one item, so there is something to send.
  anyAdded: boolean;
  onAdding: (adding: boolean) => void;
  // Hold took the answer: the report is read again and shows it.
  onAnswered: () => void;
};

// The renter's answer while the report is open: everything is as shown, or photographs of what staff missed, sent
// together once taken.
export function ConditionFooter({ token, adding, anyAdded, onAdding, onAnswered }: ConditionFooterProps) {
  const t = useTranslations('condition');
  const confirm = useRenterAction(token, 'confirm-condition');
  const send = useRenterAction(token, 'send-missed');
  const answer = async (action: typeof confirm | typeof send) => {
    const answered = await action.run({});
    if (answered?.ok === true) onAnswered();
  };
  const failed = (adding ? send : confirm).failed;
  return (
    <>
      {failed ? <RenterRefusal failed={failed} /> : null}
      {adding ? (
        <>
          <Button label={t('send')} icon="send" loading={send.pending} disabled={!anyAdded} onPress={() => void answer(send)} />
          <Button label={t('cancelAdd')} variant="secondary" onPress={() => onAdding(false)} />
        </>
      ) : (
        <>
          <Button label={t('confirm')} icon="check" loading={confirm.pending} onPress={() => void answer(confirm)} />
          <Button label={t('add')} icon="camera" variant="secondary" onPress={() => onAdding(true)} />
        </>
      )}
    </>
  );
}
