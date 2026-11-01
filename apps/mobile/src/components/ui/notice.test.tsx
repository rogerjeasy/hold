import { screen } from '@testing-library/react-native';
import { Notice } from '@/components/ui';
import { renderWithProviders } from '@/test/render';

describe('a notice', () => {
  it('says what it means in its title, not only in its colour', async () => {
    await renderWithProviders(<Notice tone="warning" title="The hold ends tomorrow" body="Return the bike by 18:00." />);
    expect(screen.getByText('The hold ends tomorrow')).toBeOnTheScreen();
    expect(screen.getByText('Return the bike by 18:00.')).toBeOnTheScreen();
  });

  it('is announced when it answers something the person did', async () => {
    await renderWithProviders(<Notice tone="destructive" announced title="That code is not right" body="Check the email." />);
    expect(screen.getByRole('alert')).toBeOnTheScreen();
  });

  it('is not announced when it was always there', async () => {
    await renderWithProviders(<Notice title="Photographs are kept" body="Both sides see them." />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
