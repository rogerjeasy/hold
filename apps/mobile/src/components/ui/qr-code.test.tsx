import { screen } from '@testing-library/react-native';
import { QrCode, qrPath } from '@/components/ui/qr-code';
import { renderWithProviders } from '@/test/render';

describe('a QR code', () => {
  it('draws every dark module of the link inside a quiet margin', () => {
    const { size, path } = qrPath('https://hold.example/r/abc');
    // Version 2 is 25 modules, and four on each side keep scanners happy.
    expect(size).toBe(33);
    expect(path.startsWith('M4 4h1v1h-1z')).toBe(true);
  });

  it('is one image a screen reader names', async () => {
    await renderWithProviders(<QrCode value="https://hold.example/r/abc" label="A code that opens the link" />);
    expect(screen.getByRole('image', { name: 'A code that opens the link' })).toBeOnTheScreen();
  });
});
