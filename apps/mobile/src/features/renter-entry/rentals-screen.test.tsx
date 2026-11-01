import { fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { RentalsScreen } from '@/features/renter-entry/rentals-screen';
import { savedRentals } from '@/storage/saved-rentals';
import { renderRoutes } from '@/test/render-router';

const TOKEN = 'B'.repeat(65);

const routes = {
  '(renter)/rentals': RentalsScreen,
  '(renter)/add-link': () => <Text>Paste screen</Text>,
  '(renter)/scan': () => <Text>Scan screen</Text>,
  '(renter)/r/[token]/index': () => <Text>Rental screen</Text>,
};

describe('the saved rentals', () => {
  it('explain how to add one when there are none, and offer both ways', async () => {
    await renderRoutes(routes, { initialUrl: '/rentals' });
    expect(await screen.findByText('No rentals on this phone yet')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: "Scan the shop's code" })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Paste a link' })).toBeOnTheScreen();
  });

  it('open the paste screen', async () => {
    const view = await renderRoutes(routes, { initialUrl: '/rentals' });
    await fireEvent.press(await screen.findByRole('button', { name: 'Paste a link' }));
    expect(view.getPathname()).toBe('/add-link');
  });

  it('open the scanner', async () => {
    const view = await renderRoutes(routes, { initialUrl: '/rentals' });
    await fireEvent.press(await screen.findByRole('button', { name: "Scan the shop's code" }));
    expect(view.getPathname()).toBe('/scan');
  });

  it('list what this phone keeps, by name once Hold has said it, and open one', async () => {
    await savedRentals.save(TOKEN, new Date(Date.UTC(2026, 10, 1, 9)));
    await savedRentals.name(TOKEN, 'Velo Zürich');
    const view = await renderRoutes(routes, { initialUrl: '/rentals' });
    await fireEvent.press(await screen.findByRole('button', { name: /Velo Zürich/ }));
    expect(view.getPathname()).toBe(`/r/${TOKEN}`);
  });
});
