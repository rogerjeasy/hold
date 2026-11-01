import { fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { RENTAL_ID, RENTAL_SUMMARY, signInStaff } from '@/features/shop-session/test-fixtures';
import { createFakeApi } from '@/test/fake-api';
import { renderRoutes } from '@/test/render-router';
import { RentalsScreen } from './rentals-screen';

const routes = {
  'shop/rentals': RentalsScreen,
  'shop/rental/[rentalId]/index': () => <Text>Rental screen</Text>,
};

describe('the rentals at the counter', () => {
  it('lists the shop rentals with where each stands', async () => {
    await signInStaff();
    await renderRoutes(routes, { initialUrl: '/shop/rentals', api: createFakeApi({ 'shop/rentals': { ok: true, value: { rentals: [RENTAL_SUMMARY, { ...RENTAL_SUMMARY, id: '9e7c3cbc-4cab-4fa3-8dc4-bc6c5c9b7d90', who: null, state: 'overdue', simulated: true }] } } }) });
    expect(await screen.findByText('Priya Raman')).toBeOnTheScreen();
    expect(screen.getByText('Ready for handover')).toBeOnTheScreen();
    expect(screen.getByText('Overdue')).toBeOnTheScreen();
    expect(screen.getByText('A renter')).toBeOnTheScreen();
    expect(screen.getByText('Sample')).toBeOnTheScreen();
  });

  it('searches by renter or item', async () => {
    await signInStaff();
    const api = createFakeApi({ 'shop/rentals': { ok: true, value: { rentals: [] } }, 'shop/rentals?q=priya%20r': { ok: true, value: { rentals: [RENTAL_SUMMARY] } } });
    await renderRoutes(routes, { initialUrl: '/shop/rentals', api });
    expect(await screen.findByText('No rentals yet')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Search by renter or item'), 'priya r');
    await fireEvent(screen.getByLabelText('Search by renter or item'), 'submitEditing');
    expect(await screen.findByText('Priya Raman')).toBeOnTheScreen();
  });

  it('says when nothing matches', async () => {
    await signInStaff();
    const api = createFakeApi({ 'shop/rentals': { ok: true, value: { rentals: [RENTAL_SUMMARY] } }, 'shop/rentals?q=zz': { ok: true, value: { rentals: [] } } });
    await renderRoutes(routes, { initialUrl: '/shop/rentals', api });
    await fireEvent.changeText(await screen.findByLabelText('Search by renter or item'), 'zz');
    await fireEvent(screen.getByLabelText('Search by renter or item'), 'submitEditing');
    expect(await screen.findByText('No rentals match')).toBeOnTheScreen();
  });

  it('opens a rental', async () => {
    await signInStaff();
    const view = await renderRoutes(routes, { initialUrl: '/shop/rentals', api: createFakeApi({ 'shop/rentals': { ok: true, value: { rentals: [RENTAL_SUMMARY] } } }) });
    await fireEvent.press(await screen.findByRole('button', { name: /Priya Raman/ }));
    expect(view.getPathname()).toBe(`/shop/rental/${RENTAL_ID}`);
  });
});
