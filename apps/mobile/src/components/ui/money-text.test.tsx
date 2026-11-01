import { screen } from '@testing-library/react-native';
import { useLocales } from 'expo-localization';
import { MoneyText } from '@/components/ui';
import { renderWithProviders } from '@/test/render';

describe('an amount', () => {
  it("reads in the phone's language, from whole cents", async () => {
    await renderWithProviders(<MoneyText money={{ cents: 125_050, currency: 'CHF' }} />);
    expect(screen.getByText(/1,250\.50/)).toBeOnTheScreen();
  });

  it('follows French grouping on a French phone', async () => {
    jest.mocked(useLocales).mockReturnValue([{ languageCode: 'fr', languageTag: 'fr-CH' } as ReturnType<typeof useLocales>[0]]);
    await renderWithProviders(<MoneyText money={{ cents: 125_050, currency: 'EUR' }} />);
    expect(screen.getByText(/1\s250,50/u)).toBeOnTheScreen();
  });

  it('drops the cents of a round amount when asked to be short', async () => {
    await renderWithProviders(<MoneyText money={{ cents: 30_000, currency: 'USD' }} style="short" />);
    expect(screen.getByText('$300')).toBeOnTheScreen();
  });
});
