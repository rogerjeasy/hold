import { pushStore } from './push-store';

const LINK = 'L'.repeat(70);
const OTHER = 'M'.repeat(70);

describe('what this phone keeps of its push notifications', () => {
  it('knows nothing until the person has decided', async () => {
    expect(await pushStore.rental(LINK)).toBeUndefined();
    expect(await pushStore.counter()).toBeUndefined();
  });

  it('keeps, for each saved rental, whether it is on and the reference Hold gave it, and finds the link by that reference', async () => {
    await pushStore.setRental(LINK, { state: 'on', reference: 'ref-one' });
    await pushStore.setRental(OTHER, { state: 'off' });
    expect(await pushStore.rental(LINK)).toEqual({ state: 'on', reference: 'ref-one' });
    expect(await pushStore.linkFor('ref-one')).toBe(LINK);
    expect(await pushStore.linkFor('ref-unknown')).toBeUndefined();
    expect(await pushStore.rentalsOn()).toEqual([LINK]);
  });

  it('follows the newest link of a rental: Hold gives the same reference again, and the older link lets it go', async () => {
    await pushStore.setRental(LINK, { state: 'on', reference: 'ref-one' });
    await pushStore.setRental(OTHER, { state: 'on', reference: 'ref-one' });
    expect(await pushStore.linkFor('ref-one')).toBe(OTHER);
    expect(await pushStore.rental(LINK)).toBeUndefined();
  });

  it('keeps the counter’s choice and the push token last registered, and forgets a rental', async () => {
    await pushStore.setCounter('on');
    await pushStore.setLastToken('ExponentPushToken[abc]');
    await pushStore.setRental(LINK, { state: 'on', reference: 'ref-one' });
    await pushStore.forgetRental(LINK);
    expect(await pushStore.counter()).toBe('on');
    expect(await pushStore.lastToken()).toBe('ExponentPushToken[abc]');
    expect(await pushStore.rental(LINK)).toBeUndefined();
  });
});
