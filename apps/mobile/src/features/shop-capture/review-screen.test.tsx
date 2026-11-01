import { fireEvent, screen } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { COMPARISON_ID, signInStaff } from '@/features/shop-session/test-fixtures';
import { createFakeApi } from '@/test/fake-api';
import { renderWithProviders } from '@/test/render';
import { ReviewScreen } from './review-screen';

jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), useLocalSearchParams: jest.fn(), router: { back: jest.fn() } }));

beforeEach(() => jest.mocked(useLocalSearchParams).mockReturnValue({ comparisonId: COMPARISON_ID }));

describe('noting what was seen at a return', () => {
  it('records the outcome and the reason with the person, and approves nothing', async () => {
    await signInStaff();
    const api = createFakeApi({ 'shop/actions/record-review': { ok: true, value: {} } });
    await renderWithProviders(<ReviewScreen />, { api });
    expect(screen.getByText(/it does not approve a charge/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('radio', { name: 'Findings' }));
    await fireEvent.changeText(screen.getByLabelText('Your inspection notes'), 'New scratch on the left crank.');
    await fireEvent.press(screen.getByRole('button', { name: 'Record inspection' }));
    expect(api.calls[0]?.options.body).toEqual({ comparisonId: COMPARISON_ID, outcome: 'findings', reason: 'New scratch on the left crank.', locale: 'en' });
    expect(await screen.findByText(/Your inspection has been recorded/)).toBeOnTheScreen();
  });

  it('asks for a note first', async () => {
    await signInStaff();
    const api = createFakeApi();
    await renderWithProviders(<ReviewScreen />, { api });
    await fireEvent.press(screen.getByRole('radio', { name: 'Clean' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Record inspection' }));
    expect(screen.getByText('Write what you observed.')).toBeOnTheScreen();
    expect(api.calls).toEqual([]);
  });

  it('says a decision is made on the web when the role may not record it', async () => {
    await signInStaff();
    const api = createFakeApi({ 'shop/actions/record-review': { ok: false, failure: 'role' } });
    await renderWithProviders(<ReviewScreen />, { api });
    await fireEvent.press(screen.getByRole('radio', { name: 'Needs a person' }));
    await fireEvent.changeText(screen.getByLabelText('Your inspection notes'), 'Could not tell.');
    await fireEvent.press(screen.getByRole('button', { name: 'Record inspection' }));
    expect(await screen.findByText('This is decided on the web')).toBeOnTheScreen();
  });
});
