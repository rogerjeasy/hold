'use client'
import type { ClaimMessage } from '@hold/db'
import { useTranslations } from 'next-intl'
import { Panel } from '@/components/ui/panel'
import { RenterMessageForm, ShopMessageForm } from './message-forms'
import { MessageThread } from './message-thread'

// The renter and the shop writing to each other about a claim (architecture.md section 6.16), on both claim pages.

type Common = { readonly messages: readonly ClaimMessage[]; readonly shopName: string; readonly renterName: string | null; readonly timeZone: string; readonly canWrite: boolean }
type Props = Common & ({ readonly audience: 'renter'; readonly token: string } | { readonly audience: 'shop'; readonly rentalId: string })

export function ClaimConversation(props: Props) {
  const t = useTranslations('promise.messages')
  const renter = props.renterName ?? t('theRenter')
  const title = props.audience === 'renter' ? t('renterTitle', { shop: props.shopName }) : t('shopTitle', { renter })
  return (
    <Panel title={title}>
      <div className="grid gap-5 p-4 md:p-5">
        <MessageThread messages={props.messages} audience={props.audience} shopName={props.shopName} renterName={props.renterName} timeZone={props.timeZone} />
        {!props.canWrite ? null : props.audience === 'renter' ? <RenterMessageForm token={props.token} /> : <ShopMessageForm rentalId={props.rentalId} renterName={renter} />}
      </div>
    </Panel>
  )
}
