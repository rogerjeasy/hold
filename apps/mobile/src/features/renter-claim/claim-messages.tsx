import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';
import { Button, Field, Panel, Text } from '@/components/ui';
import { ActionFailure, Confirmed, useRenterAction, useShopTime } from '@/features/renter-common';
import type { RenterClaim } from './claim-screen';

const MESSAGE_LIMIT = 1000;

// The renter and the shop writing to each other about the claim (architecture.md section 6.16), oldest first. The
// renter's own words sit to the right; each says who wrote it and when, so the side is never shown by colour alone.
export function ClaimMessages({ token, claim, refresh }: { token: string; claim: RenterClaim; refresh: () => void }) {
  const t = useTranslations('claim.messages');
  const results = useTranslations('claim.messageResults');
  const time = useShopTime(claim.timeZone);
  const write = useRenterAction(token, 'write-to-shop');
  const [body, setBody] = useState('');
  const send = async () => {
    const answer = await write.run({ body: body.trim() });
    if (answer?.ok) {
      setBody('');
      refresh();
    }
  };
  const author = (message: RenterClaim['messages'][number]) => (message.author === 'renter' ? t('you') : `${message.authorName ?? t('staff')}, ${claim.shopName}`);
  return (
    <Panel title={t('renterTitle', { shop: claim.shopName })}>
      <View className="gap-5 p-4">
        {claim.messages.length === 0 ? (
          <Text tone="muted">{t('empty')}</Text>
        ) : (
          <View className="gap-3">
            {claim.messages.map((message) => {
              const own = message.author === 'renter';
              return (
                <View key={message.id} className={`max-w-[88%] gap-1 border border-border p-3 ${own ? 'self-end bg-muted' : 'self-start bg-card'}`}>
                  <Text variant="small" tone="muted">
                    {author(message)} · {time.when(message.createdAt)}
                  </Text>
                  <Text selectable>{message.body}</Text>
                </View>
              );
            })}
          </View>
        )}
        {claim.canWrite ? (
          <View className="gap-3">
            <Field label={t('writeRenter')} hint={t('renterHint')} value={body} onChangeText={setBody} multiline maxLength={MESSAGE_LIMIT} textAlignVertical="top" />
            <Button label={t('send')} icon="send" variant="secondary" onPress={() => void send()} loading={write.pending} disabled={body.trim() === ''} />
            {write.done ? <Confirmed text={t('sent')} /> : null}
            <ActionFailure failed={write.failed} wording={{ message_invalid: results('message_invalid'), rate_limited: results('rate_limited'), not_found: results('not_found') }} />
          </View>
        ) : null}
      </View>
    </Panel>
  );
}
