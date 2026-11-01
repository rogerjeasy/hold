import { fireEvent, screen } from '@testing-library/react-native';
import { Button } from '@/components/ui';
import { renderWithProviders } from '@/test/render';

describe('a button', () => {
  it('is a button named by its label, and does its action', async () => {
    const onPress = jest.fn();
    await renderWithProviders(<Button label="Open rental" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Open rental' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('says it is busy while its action runs, keeps its name and cannot be pressed twice', async () => {
    const onPress = jest.fn();
    await renderWithProviders(<Button label="Open rental" loading onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Open rental' });
    expect(button).toBeBusy();
    expect(button).toBeDisabled();
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('cannot be pressed when disabled, and says so', async () => {
    const onPress = jest.fn();
    await renderWithProviders(<Button label="Remove" variant="destructive" disabled onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Remove' });
    expect(button).toBeDisabled();
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});
