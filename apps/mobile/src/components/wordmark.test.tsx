import { screen } from '@testing-library/react-native';
import { Wordmark } from '@/components/wordmark';
import { renderWithProviders } from '@/test/render';

describe('the wordmark', () => {
  it('reads as the name, once, to a screen reader', async () => {
    await renderWithProviders(<Wordmark size={40} />);
    expect(screen.getByRole('image', { name: 'Hold' })).toBeOnTheScreen();
  });
});
