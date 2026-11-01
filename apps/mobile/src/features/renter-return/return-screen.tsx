import { useTranslations } from 'use-intl';
import type { RenterView } from '@hold/mobile-api';
import { Notice, Screen } from '@/components/ui';
import { LoadedScreen, ShopLine, useLookAgain, useRenterView } from '@/features/renter-common';
import { ReturnCapture } from './return-capture';
import { ReturnIntro } from './return-intro';
import { ReturnReceipt } from './return-receipt';

export type SelfReturn = RenterView<'return'>;

// The renter returns the item with nobody at the counter (architecture.md section 6.13): first where to leave it and
// what happens next, then the photographs, then a receipt that stays.
export function ReturnScreen({ token }: { token: string }) {
  const t = useTranslations('selfReturn');
  const { state, retry } = useRenterView(token, 'return');
  return (
    <LoadedScreen state={state} onRetry={retry} empty={{ title: t('unavailable.title'), body: '' }}>
      {(view) => <Stage token={token} view={view} refresh={retry} />}
    </LoadedScreen>
  );
}

function Stage({ token, view, refresh }: { token: string; view: SelfReturn; refresh: () => void }) {
  const t = useTranslations('selfReturn');
  const preparing = view.items.some((item) => item.photos.some((photo) => photo.url === null && !photo.simulated));
  // Photographs being prepared, or a person yet to look at the drop point: the screen looks again by itself.
  useLookAgain(preparing || (view.stage === 'sent' && view.rentalState === 'dropped_off'), refresh);
  const top = <ShopLine shopName={view.shopName} simulated={view.simulated} />;
  if (view.stage === 'intro') return <ReturnIntro token={token} view={view} top={top} refresh={refresh} />;
  if (view.stage === 'capture') return <ReturnCapture token={token} view={view} top={top} refresh={refresh} />;
  if (view.stage === 'sent' && view.droppedOffAt !== null) return <ReturnReceipt token={token} view={view} droppedOffAt={view.droppedOffAt} top={top} />;
  return (
    <Screen>
      {top}
      <Notice title={t('unavailable.title')} body={t('unavailable.body', { shop: view.shopName })} />
    </Screen>
  );
}
