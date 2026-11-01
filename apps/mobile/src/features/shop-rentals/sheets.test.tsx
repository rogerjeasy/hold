import { fireEvent, screen } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { ITEM_ID, RENTAL_ID, signInStaff } from '@/features/shop-session/test-fixtures';
import { createFakeApi } from '@/test/fake-api';
import { renderWithProviders } from '@/test/render';
import { ItemStatusScreen } from './item-status-screen';
import { LinkScreen } from './link-screen';
import { MessageScreen } from './message-screen';

jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), useLocalSearchParams: jest.fn(), router: { back: jest.fn(), canGoBack: () => true } }));

const params = (value: Record<string, string>) => jest.mocked(useLocalSearchParams).mockReturnValue(value);

describe("the renter's link as a code", () => {
  it('makes a new link and draws it for the renter to scan', async () => {
    await signInStaff();
    params({ rentalId: RENTAL_ID });
    const api = createFakeApi({ 'shop/actions/show-renter-link': { ok: true, value: { url: 'https://hold.example/r/abc' } } });
    await renderWithProviders(<LinkScreen />, { api });
    expect(await screen.findByRole('img', { name: 'A code that opens https://hold.example/r/abc' })).toBeOnTheScreen();
    expect(screen.getByText("Scan with the renter's phone")).toBeOnTheScreen();
  });

  it('asks for the hold with its own code', async () => {
    await signInStaff();
    params({ rentalId: RENTAL_ID, purpose: 'hold' });
    const api = createFakeApi({ 'shop/actions/ask-for-hold': { ok: true, value: { url: 'https://hold.example/r/abc/pay' } } });
    await renderWithProviders(<LinkScreen />, { api });
    expect(await screen.findByText('Scan to approve the hold')).toBeOnTheScreen();
    expect(api.calls[0]?.options.body).toEqual({ rentalId: RENTAL_ID, locale: 'en' });
  });

  it('says why no link was made', async () => {
    await signInStaff();
    params({ rentalId: RENTAL_ID, purpose: 'hold' });
    const api = createFakeApi({ 'shop/actions/ask-for-hold': { ok: false, failure: 'refused', reason: 'not_booked' } });
    await renderWithProviders(<LinkScreen />, { api });
    expect(await screen.findByText('The fee must be paid before the hold is asked for.')).toBeOnTheScreen();
  });
});

describe('writing to the renter', () => {
  it('sends the message and says so', async () => {
    await signInStaff();
    params({ rentalId: RENTAL_ID });
    const api = createFakeApi({ 'shop/actions/write-to-renter': { ok: true, value: { rentalId: RENTAL_ID, body: 'We checked it again.' } } });
    await renderWithProviders(<MessageScreen />, { api });
    await fireEvent.changeText(screen.getByLabelText('Your message'), ' We checked it again. ');
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    expect(api.calls[0]?.options.body).toEqual({ rentalId: RENTAL_ID, body: 'We checked it again.', locale: 'en' });
    expect(await screen.findByText('Sent.')).toBeOnTheScreen();
  });

  it('asks for words before sending', async () => {
    await signInStaff();
    params({ rentalId: RENTAL_ID });
    const api = createFakeApi();
    await renderWithProviders(<MessageScreen />, { api });
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    expect(screen.getByText('Write a message of up to 1000 characters.')).toBeOnTheScreen();
    expect(api.calls).toEqual([]);
  });
});

describe("an item's status", () => {
  it('sends an item to repair with a note', async () => {
    await signInStaff();
    params({ rentalId: RENTAL_ID, itemId: ITEM_ID, label: 'City e-bike 4' });
    const api = createFakeApi({ 'shop/actions/change-item-status': { ok: true, value: {} } });
    await renderWithProviders(<ItemStatusScreen />, { api });
    expect(screen.getByText('City e-bike 4')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('radio', { name: 'In repair' }));
    await fireEvent.changeText(screen.getByLabelText('Note (optional)'), 'Flat tyre');
    await fireEvent.press(screen.getByRole('button', { name: 'Save the status' }));
    expect(api.calls[0]?.options.body).toEqual({ itemId: ITEM_ID, status: 'in_repair', note: 'Flat tyre', locale: 'en' });
    expect(await screen.findByText('Status saved.')).toBeOnTheScreen();
  });

  it('says plainly what the role may not do', async () => {
    await signInStaff();
    params({ rentalId: RENTAL_ID, itemId: ITEM_ID, label: 'City e-bike 4' });
    const api = createFakeApi({ 'shop/actions/change-item-status': { ok: false, failure: 'refused', reason: 'role_may_not_retire' } });
    await renderWithProviders(<ItemStatusScreen />, { api });
    await fireEvent.press(screen.getByRole('radio', { name: 'Retired' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save the status' }));
    expect(await screen.findByText('Only the owner or a manager can retire an item.')).toBeOnTheScreen();
  });
});
