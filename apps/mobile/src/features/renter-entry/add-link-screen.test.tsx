import { fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { AddLinkScreen } from '@/features/renter-entry/add-link-screen';
import { renderRoutes } from '@/test/render-router';

jest.mock('@/api/hold', () => ({ ...jest.requireActual('@/api/hold'), holdLinkHosts: () => ['hold.example'] }));

const TOKEN = 'C'.repeat(65);
const routes = {
  '(renter)/add-link': AddLinkScreen,
  '(renter)/r/[token]/index': () => <Text>Rental screen</Text>,
};

describe('pasting a rental link', () => {
  it('asks for the link when there is none', async () => {
    await renderRoutes(routes, { initialUrl: '/add-link' });
    await fireEvent.press(screen.getByRole('button', { name: 'Open rental' }));
    expect(screen.getByText('Paste the link the shop sent you.')).toBeOnTheScreen();
  });

  it('says plainly when the text is not a Hold rental link', async () => {
    await renderRoutes(routes, { initialUrl: '/add-link' });
    await fireEvent.changeText(screen.getByLabelText('Rental link'), 'https://elsewhere.example/r/abc');
    await fireEvent.press(screen.getByRole('button', { name: 'Open rental' }));
    expect(screen.getByText('That is not a Hold rental link. Check you copied all of it.')).toBeOnTheScreen();
  });

  it('opens the rental the link names', async () => {
    const view = await renderRoutes(routes, { initialUrl: '/add-link' });
    await fireEvent.changeText(screen.getByLabelText('Rental link'), `Your rental: https://hold.example/fr/r/${TOKEN}`);
    await fireEvent.press(screen.getByRole('button', { name: 'Open rental' }));
    expect(view.getPathname()).toBe(`/r/${TOKEN}`);
  });
});
