import { act, fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { StartScreen } from '@/features/start/start-screen';
import { savedRentals } from '@/storage/saved-rentals';
import { renderRoutes } from '@/test/render-router';

const routes = {
  index: StartScreen,
  '(renter)/rentals': () => <Text>Saved rentals</Text>,
  'shop/index': () => <Text>Shop</Text>,
};

describe('the start screen', () => {
  it('shows the wordmark and what Hold is', async () => {
    await renderRoutes(routes);
    expect(screen.getByRole('image', { name: 'Hold' })).toBeOnTheScreen();
    expect(screen.getByText('The deposit that never leaves your account.')).toBeOnTheScreen();
  });

  it('takes a renter to their rentals', async () => {
    const view = await renderRoutes(routes);
    await fireEvent.press(screen.getByRole('button', { name: /I'm renting/ }));
    expect(view.getPathname()).toBe('/rentals');
  });

  it('takes a member of staff to the shop', async () => {
    const view = await renderRoutes(routes);
    await fireEvent.press(screen.getByRole('button', { name: /I work at a shop/ }));
    expect(view.getPathname()).toBe('/shop');
  });

  it('says how many rentals this phone keeps', async () => {
    await savedRentals.save('A'.repeat(65), new Date());
    await renderRoutes(routes);
    await act(async () => undefined);
    expect(screen.getByText('1 rental on this phone')).toBeOnTheScreen();
  });
});
