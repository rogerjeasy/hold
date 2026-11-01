import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslations } from 'use-intl';
import type { Me } from '@hold/mobile-api';
import { useApi } from '@/api';
import { Button, LoadState, Panel, SampleLabel, Screen, Text } from '@/components/ui';
import { CounterPush } from '@/features/push/counter-push';
import { staffSession } from '@/storage/staff-session';
import { useStaffSession } from '@/storage/use-staff-session';
import { SignOutButton } from './choose-shop-screen';
import { otherAccount, useKeptDemo, type KeptDemo } from './demo-store';
import { RefusalNotice, type Refusal } from './refusal';
import { signIntoDemo } from './use-demo-sign-in';
import { useMe } from './use-me';
import { useSessionKey } from './use-session-key';

// Who is signed in and where, as a sheet over the day: in the demo, switching to the other person; in several shops,
// changing shop; and signing out.
export function AccountScreen() {
  const key = useSessionKey();
  const { state, retry } = useMe(key);
  return (
    <Screen>
      <LoadState state={state} onRetry={retry} empty={{ title: '', body: '' }}>
        {(me) => <Account me={me} />}
      </LoadState>
    </Screen>
  );
}

function Account({ me }: { me: Me }) {
  const t = useTranslations('shop');
  const session = useStaffSession();
  const kept = useKeptDemo();
  const shopId = session.status === 'signed_in' ? session.session.shopId : undefined;
  const shop = me.shops.find((each) => each.shopId === shopId);
  const inDemo = kept != null && kept.shopId === shopId;
  return (
    <>
      <Panel title={me.name ?? me.email} aside={inDemo ? <SampleLabel /> : undefined}>
        <View className="gap-3 p-4">
          <Row label={t('account.signedInAs')} value={me.email} />
          {shop ? <Row label={t('account.shop')} value={shop.name} /> : null}
          {shop ? <Row label={t('account.role')} value={t(`roles.${shop.role}`)} /> : null}
          {inDemo ? (
            <Text variant="small" tone="muted">
              {t('account.demoNote')}
            </Text>
          ) : null}
        </View>
      </Panel>
      {shop ? <CounterPush shopName={shop.name} /> : null}
      <View className="gap-3">
        {inDemo && kept ? <SwitchPerson kept={kept} /> : null}
        {me.shops.length > 1 ? (
          <Button
            variant="secondary"
            icon="shop"
            label={t('account.changeShop')}
            onPress={() =>
              void staffSession.read().then((current) => {
                if (current !== undefined) return staffSession.write({ accessToken: current.accessToken, refreshToken: current.refreshToken, expiresAt: current.expiresAt });
              })
            }
            className="self-start"
          />
        ) : null}
        <SignOutButton />
      </View>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="gap-0.5">
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <Text selectable>{value}</Text>
    </View>
  );
}

// The judges see both sides of the counter: the owner who decides, and the member of staff who hands over.
function SwitchPerson({ kept }: { kept: KeptDemo }) {
  const t = useTranslations('shop');
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | undefined>(undefined);
  const next = otherAccount(kept.account);
  const person = t(`demo.${next}.name`);
  return (
    <View className="gap-3">
      <Button
        icon="swap"
        label={busy ? t('account.switching') : t('account.switchTo', { person })}
        loading={busy}
        onPress={async () => {
          setBusy(true);
          const refused = await signIntoDemo(api, next, kept.demo);
          setBusy(false);
          setRefusal(refused);
          if (refused === undefined && router.canGoBack()) router.back();
        }}
      />
      {refusal ? <RefusalNotice refusal={refusal} /> : null}
    </View>
  );
}
