import * as SecureStore from 'expo-secure-store';
import { savedRentals } from '@/storage/saved-rentals';

const token = (n: number) => `${'A'.repeat(60)}${String(n).padStart(5, '0')}`;
const at = (minute: number) => new Date(Date.UTC(2026, 10, 1, 9, minute));

describe('the rentals saved on this phone', () => {
  it('starts empty', async () => {
    await expect(savedRentals.list()).resolves.toEqual([]);
  });

  it('keeps a rental once, newest first', async () => {
    await savedRentals.save(token(1), at(0));
    await savedRentals.save(token(2), at(1));
    await savedRentals.save(token(1), at(2));
    const list = await savedRentals.list();
    expect(list.map((rental) => rental.token)).toEqual([token(1), token(2)]);
    expect(list[0]?.openedAt).toBe(at(2).toISOString());
  });

  it('remembers what the rental is called once Hold has said', async () => {
    await savedRentals.save(token(1), at(0));
    await savedRentals.name(token(1), 'Velo Zürich · 2 bikes');
    await savedRentals.save(token(1), at(5));
    expect((await savedRentals.list())[0]?.title).toBe('Velo Zürich · 2 bikes');
  });

  it('removes one', async () => {
    await savedRentals.save(token(1), at(0));
    await savedRentals.save(token(2), at(1));
    await savedRentals.remove(token(1));
    expect((await savedRentals.list()).map((rental) => rental.token)).toEqual([token(2)]);
  });

  it('keeps the most recent few, so the device store stays small', async () => {
    for (let n = 0; n < 15; n += 1) await savedRentals.save(token(n), at(n));
    const list = await savedRentals.list();
    expect(list).toHaveLength(10);
    expect(list[0]?.token).toBe(token(14));
  });

  it('reads a damaged store as empty instead of failing', async () => {
    await SecureStore.setItemAsync('hold.saved-rentals', '{not json');
    await expect(savedRentals.list()).resolves.toEqual([]);
  });

  it('reads a store the phone cannot open as empty, so the screen still works', async () => {
    jest.mocked(SecureStore.getItemAsync).mockRejectedValueOnce(new Error('User interaction is not allowed.'));
    await expect(savedRentals.list()).resolves.toEqual([]);
  });

  it('keeps the links where only this device can read them', async () => {
    await savedRentals.save(token(1), at(0));
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('hold.saved-rentals', expect.any(String), {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
  });

  it('tells a screen that shows them when they change', async () => {
    const heard = jest.fn();
    const stop = savedRentals.subscribe(heard);
    await savedRentals.save(token(1), at(0));
    stop();
    await savedRentals.save(token(2), at(1));
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
