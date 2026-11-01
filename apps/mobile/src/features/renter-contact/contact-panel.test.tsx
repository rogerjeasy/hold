import { fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import RenterLayout from '@/app/(renter)/_layout';
import RentalRoute from '@/app/(renter)/r/[token]/index';
import PayRoute from '@/app/(renter)/r/[token]/pay';
import { RENTER_TOKEN as TOKEN, contactView, holdAnswer, rentalAnswer } from '@/features/renter-rental/fixtures';
import { createFakeApi } from '@/test/fake-api';
import { renderRoutes } from '@/test/render-router';

jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));

const routes = {
  '(renter)/_layout': RenterLayout,
  '(renter)/r/[token]/index': RentalRoute,
  '(renter)/r/[token]/pay': PayRoute,
  '(renter)/r/[token]/contact': () => <Text>Contact page</Text>,
};
const open = (path: string, replies: Parameters<typeof createFakeApi>[0]) => renderRoutes(routes, { initialUrl: `/r/${TOKEN}${path}`, api: createFakeApi(replies) });

describe('how we reach you, on the rental', () => {
  it('says how Hold reaches the renter, and opens the page to choose texts or email', async () => {
    const view = await open('', { 'renter/rental': rentalAnswer({}, { contact: contactView({ channel: 'text', phone: '+41 ••• •• 67', confirmed: true }) }) });
    expect(await screen.findByText('How we reach you')).toBeOnTheScreen();
    expect(screen.getByText('By text to +41 ••• •• 67')).toBeOnTheScreen();
    expect(screen.getByText('Confirmed')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Choose texts or email' }));
    expect(await screen.findByText('Contact page')).toBeOnTheScreen();
    expect(view.getPathname()).toBe(`/r/${TOKEN}/contact`);
  });

  it('is not offered on a sample rental', async () => {
    await open('', { 'renter/rental': rentalAnswer({ simulated: true }) });
    await screen.findByText('Velo Zürich');
    expect(screen.queryByText('How we reach you')).toBeNull();
  });

  it('is not offered on a closed rental', async () => {
    await open('', { 'renter/rental': rentalAnswer({ state: 'closed' }) });
    await screen.findByText('Velo Zürich');
    expect(screen.queryByText('How we reach you')).toBeNull();
  });
});

describe('how we reach you, on the hold', () => {
  it('is offered while the hold is being approved', async () => {
    await open('/pay', { 'renter/hold': holdAnswer({}) });
    expect(await screen.findByText('How we reach you')).toBeOnTheScreen();
    expect(screen.getByText('By email')).toBeOnTheScreen();
  });

  it('is left to the rental once the hold is placed', async () => {
    await open('/pay', { 'renter/hold': holdAnswer({ state: 'placed' }, { state: 'ready' }, contactView({ locked: true })) });
    await screen.findByText(/is placed/);
    expect(screen.queryByText('How we reach you')).toBeNull();
  });
});
