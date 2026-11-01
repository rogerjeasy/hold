import { fireEvent, screen } from '@testing-library/react-native';
import { CodeInput } from '@/components/ui';
import { renderWithProviders } from '@/test/render';

describe('a one-time code', () => {
  it('is one field, labelled and explained', async () => {
    await renderWithProviders(<CodeInput length={8} value="" onChange={jest.fn()} />);
    expect(screen.getByLabelText('One-time code')).toHaveProp('accessibilityHint', '8 digits, from the email or text Hold sent you.');
  });

  it('keeps digits only, up to its length', async () => {
    const onChange = jest.fn();
    await renderWithProviders(<CodeInput length={8} value="" onChange={onChange} />);
    await fireEvent.changeText(screen.getByLabelText('One-time code'), '12 34-56789');
    expect(onChange).toHaveBeenCalledWith('12345678');
  });

  // The boxes are only how the field looks; a screen reader reads the field itself.
  it('shows each digit in its own box', async () => {
    await renderWithProviders(<CodeInput length={4} value="12" onChange={jest.fn()} />);
    expect(screen.getByText('1', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByText('2', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('says what is wrong with it', async () => {
    await renderWithProviders(<CodeInput length={8} value="1234" onChange={jest.fn()} error="That code is not right." />);
    expect(screen.getByText('That code is not right.')).toBeOnTheScreen();
    expect(screen.getByLabelText('One-time code')).toHaveProp('accessibilityHint', 'That code is not right.');
  });
});
