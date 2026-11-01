import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useTranslations } from 'use-intl';
import type { Me } from '@hold/mobile-api';
import { useApi } from '@/api';
import { Button, Icon, LoadState, Screen, Text } from '@/components/ui';
import { staffSession } from '@/storage/staff-session';
import { useTheme } from '@/theme';
import { signOut } from './sign-out';
import { useMe } from './use-me';
import { useSessionKey } from './use-session-key';

const choose = async (shopId: string) => {
  const session = await staffSession.read();
  if (session !== undefined) await staffSession.write({ ...session, shopId });
};

// After signing in: the shop at this counter. Someone in one shop goes straight to its day; someone in several picks
// one; someone in none is told to ask the owner.
export function ChooseShopScreen() {
  const t = useTranslations('shop.chooseShop');
  const key = useSessionKey();
  const { state, retry } = useMe(key);
  return (
    <Screen>
      <LoadState state={state} onRetry={retry} empty={{ title: t('noShopTitle'), body: t('noShopBody'), action: <SignOutButton /> }} isEmpty={(me) => me.shops.length === 0}>
        {(me) => <Shops me={me} />}
      </LoadState>
    </Screen>
  );
}

function Shops({ me }: { me: Me }) {
  const t = useTranslations('shop');
  const { color } = useTheme();
  const only = me.shops.length === 1 ? me.shops[0] : undefined;
  useEffect(() => {
    if (only !== undefined) void choose(only.shopId);
  }, [only]);
  if (only !== undefined) {
    return (
      <View className="items-center gap-3 py-12">
        <ActivityIndicator color={color.mutedForeground} />
        <Text tone="muted">{t('chooseShop.opening')}</Text>
      </View>
    );
  }
  return (
    <>
      <Text tone="muted">{t('chooseShop.lead')}</Text>
      <View className="border-y border-border bg-card">
        {me.shops.map((shop, index) => (
          <Pressable
            key={shop.shopId}
            role="button"
            aria-label={`${shop.name}, ${t(`roles.${shop.role}`)}`}
            onPress={() => void choose(shop.shopId)}
            className={`min-h-touch flex-row items-center gap-3 px-4 py-3.5 active:bg-accent ${index === 0 ? '' : 'border-t border-border'}`}
          >
            <Icon name="shop" color={color.mutedForeground} />
            <View className="min-w-0 flex-1 gap-0.5">
              <Text variant="bodyStrong" numberOfLines={2}>
                {shop.name}
              </Text>
              <Text variant="small" tone="muted">
                {t(`roles.${shop.role}`)}
              </Text>
            </View>
            <Icon name="forward" color={color.mutedForeground} size={18} />
          </Pressable>
        ))}
      </View>
      <SignOutButton />
    </>
  );
}

export function SignOutButton() {
  const t = useTranslations('shop.account');
  const api = useApi();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      icon="signOut"
      label={busy ? t('signingOut') : t('signOut')}
      loading={busy}
      onPress={() => {
        setBusy(true);
        void signOut(api);
      }}
      className="self-start"
    />
  );
}
