import { pushStore } from './push-store';
import { pushTarget } from './push-route';

const LINK = 'L'.repeat(70);
const SHOP = '0b8f4f2e-5f1e-4c1a-9a35-2f7f6f0e8a01';
const RENTAL = '6f1c1e0e-3d2b-4c8e-9a51-2f7b5c1d9e10';

describe('where a tapped notification leads', () => {
  it('opens the page of the saved rental its reference stands for', async () => {
    await pushStore.setRental(LINK, { state: 'on', reference: 'ref-1' });
    expect(await pushTarget({ kind: 'renter', reference: 'ref-1', page: 'claim' })).toEqual({ href: `/r/${LINK}/claim` });
    expect(await pushTarget({ kind: 'renter', reference: 'ref-1', page: 'rental' })).toEqual({ href: `/r/${LINK}` });
  });

  it('opens the counter screen it names, in its shop', async () => {
    expect(await pushTarget({ kind: 'staff', shopId: SHOP, path: `/shop/rental/${RENTAL}` })).toEqual({ href: `/shop/rental/${RENTAL}`, shopId: SHOP });
  });

  it('opens nothing for a rental this phone does not hold, one turned off, or anything else a push might say', async () => {
    await pushStore.setRental(LINK, { state: 'off' });
    for (const data of [
      { kind: 'renter', reference: 'ref-1', page: 'claim' },
      { kind: 'renter', reference: 'unknown', page: 'claim' },
      { kind: 'renter', reference: 'ref-1', page: 'pay' },
      { kind: 'staff', shopId: SHOP, path: '/shop/account' },
      { kind: 'staff', shopId: SHOP, path: 'https://evil.example' },
      { url: 'hold://r/stolen' },
      null,
      'claim',
    ]) expect(await pushTarget(data)).toBeUndefined();
  });
});
