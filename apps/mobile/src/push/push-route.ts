import { pushDataSchema } from '@hold/mobile-api';
import { pushStore } from './push-store';

// Where a tapped notification leads (architecture.md section 13.9). Anyone holding this phone's push token could send
// it a notification, so what one says is checked against the contract and against this phone's own records: a
// renter's opens a page of a rental saved here and turned on, by the reference Hold gave this phone for it; a member of
// staff's opens one of the counter's screens. Anything else opens nothing.
export type PushTarget = { readonly href: string; readonly shopId?: string };

export async function pushTarget(data: unknown): Promise<PushTarget | undefined> {
  const parsed = pushDataSchema.safeParse(data);
  if (!parsed.success) return undefined;
  const push = parsed.data;
  if (push.kind === 'staff') return { href: push.path, shopId: push.shopId };
  const link = await pushStore.linkFor(push.reference);
  if (link === undefined) return undefined;
  return { href: push.page === 'rental' ? `/r/${link}` : `/r/${link}/${push.page}` };
}
