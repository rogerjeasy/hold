import { useTranslations } from 'use-intl';
import { LoadState, Notice, Screen } from '@/components/ui';
import { useRenterView } from '@/features/renter-common';
import { contactOnRental } from '@/features/renter-contact/contact';
import { ContactPanel } from '@/features/renter-contact/contact-panel';
import { RentalPush } from '@/features/push/rental-push';
import { RentalFooter, hasFooter } from './rental-footer';
import { RentalLinks } from './rental-links';
import { RentalStatus } from './rental-status';
import { RentalTerms } from './rental-terms';
import { RentedLines } from './rented-lines';
import { SelfReturnCard } from './self-return-card';
import { TwoAmounts } from './two-amounts';

// The renter's own rental, opened from their link: where it stands and what comes next, every page of it that applies,
// what they rent, the two amounts, and the terms they agreed to. Whether the link works at all is this screen's answer.
export function RentalScreen({ token }: { token: string }) {
  const t = useTranslations('rental');
  const { state, retry } = useRenterView(token, 'rental');
  const rental = state.status === 'ready' ? state.value : undefined;
  return (
    <Screen footer={rental !== undefined && hasFooter(rental.view) ? <RentalFooter token={token} view={rental.view} /> : undefined}>
      <LoadState state={state} onRetry={retry} empty={{ title: '', body: '' }}>
        {(value) => (
          <>
            <RentalStatus view={value.view} />
            {value.selfReturn.offered && value.selfReturn.shopClosed ? <SelfReturnCard token={token} /> : null}
            <RentalContact token={token} rental={value} />
            <RentalPush token={token} />
            <RentalLinks token={token} rental={value} />
            {value.askConsent ? <Notice title={t('cleanRecord')} body={t('consentQuestion')} /> : null}
            <RentedLines view={value.view} />
            <TwoAmounts view={value.view} />
            <RentalTerms view={value.view} />
          </>
        )}
      </LoadState>
    </Screen>
  );
}

function RentalContact({ token, rental }: { token: string; rental: Parameters<typeof contactOnRental>[0] }) {
  const contact = contactOnRental(rental);
  return contact === undefined ? null : <ContactPanel token={token} contact={contact} />;
}
