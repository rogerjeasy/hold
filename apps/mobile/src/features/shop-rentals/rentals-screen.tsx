import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';
import { rentalsSchema } from '@hold/mobile-api';
import { useAnswer } from '@/api';
import { Field, LoadState, RefreshableScreen } from '@/components/ui';
import { staffRead } from '@/features/shop-session/staff-request';
import { useSessionKey } from '@/features/shop-session/use-session-key';
import { RentalRow } from './rental-row';

const SEARCH_PAUSE_MS = 350;

// Every rental of the shop, newest first, searched by the renter's name or email or an item, as the web's list.
export function RentalsScreen() {
  const t = useTranslations('shop.rentals');
  const [typed, setTyped] = useState('');
  const [query, setQuery] = useState('');
  // Searches once typing pauses, or at once on the keyboard's search key.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(typed.trim()), SEARCH_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [typed]);
  const path = query === '' ? 'shop/rentals' : `shop/rentals?q=${encodeURIComponent(query)}`;
  const { state, retry } = useAnswer(`${path}:${useSessionKey()}`, (api) => staffRead(api, path, rentalsSchema));
  return (
    <RefreshableScreen refreshing={state.status === 'ready' && state.refreshing} onRefresh={retry}>
      <Field
        label={t('search')}
        placeholder={t('searchHint')}
        value={typed}
        onChangeText={setTyped}
        onSubmitEditing={() => setQuery(typed.trim())}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        role="searchbox"
      />
      <LoadState
        state={state}
        onRetry={retry}
        isEmpty={(answer) => answer.rentals.length === 0}
        empty={query === '' ? { title: t('emptyTitle'), body: t('emptyBody') } : { title: t('noMatchTitle'), body: t('noMatchBody') }}
      >
        {({ rentals }) => (
          <View className="border-y border-border bg-card">
            {rentals.map((rental, index) => (
              <RentalRow key={rental.id} rental={rental} first={index === 0} />
            ))}
          </View>
        )}
      </LoadState>
    </RefreshableScreen>
  );
}
