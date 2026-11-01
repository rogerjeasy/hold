import { fireEvent, screen } from '@testing-library/react-native';
import { Field } from '@/components/ui';
import { renderWithProviders } from '@/test/render';

describe('a field', () => {
  it('is found by its label and explained by its hint', async () => {
    const onChangeText = jest.fn();
    await renderWithProviders(<Field label="Rental link" hint="It starts with https://" value="" onChangeText={onChangeText} />);
    const input = screen.getByLabelText('Rental link');
    expect(input).toHaveProp('accessibilityHint', 'It starts with https://');
    await fireEvent.changeText(input, 'https://');
    expect(onChangeText).toHaveBeenCalledWith('https://');
  });

  it('shows its problem in words, in place of the hint', async () => {
    await renderWithProviders(<Field label="Rental link" hint="It starts with https://" error="That is not a Hold link." value="x" onChangeText={jest.fn()} />);
    expect(screen.getByText('That is not a Hold link.')).toBeOnTheScreen();
    expect(screen.queryByText('It starts with https://')).toBeNull();
  });
});
