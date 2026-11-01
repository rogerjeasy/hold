/**
 * @jest-environment node
 */
import path from 'node:path';
import { font, kebab, radius, tailwindColors, type } from '@hold/design-tokens';

// Builds the Tailwind theme the way NativeWind does on each platform. Its native preset adds font classes of its own
// (sans, serif, mono); this guards against one of them silently replacing a Hold font on a phone.
function resolvedTheme(os: 'ios' | 'android') {
  const previous = process.env.NATIVEWIND_OS;
  process.env.NATIVEWIND_OS = os;
  try {
    jest.resetModules();
    // Fresh requires on purpose: the NativeWind preset reads NATIVEWIND_OS when it loads.
    /* eslint-disable @typescript-eslint/no-require-imports */
    const loadConfig = require('tailwindcss/loadConfig');
    const resolveConfig = require('tailwindcss/resolveConfig');
    /* eslint-enable @typescript-eslint/no-require-imports */
    return resolveConfig(loadConfig(path.resolve(__dirname, '../../tailwind.config.ts'))).theme;
  } finally {
    process.env.NATIVEWIND_OS = previous;
  }
}

describe.each(['ios', 'android'] as const)('the Tailwind theme on %s', (os) => {
  const theme = resolvedTheme(os);

  it('maps every font class to its Hold font file', () => {
    for (const [token, file] of Object.entries(font)) {
      expect([kebab(token), theme.fontFamily[kebab(token)]]).toEqual([kebab(token), [file]]);
    }
  });

  it('has only Hold colours, each read from its theme variable', () => {
    expect(theme.colors).toEqual({ transparent: 'transparent', ...tailwindColors() });
  });

  it('has a text size for every type style, in points', () => {
    for (const [token, style] of Object.entries(type)) {
      const [size, { lineHeight }] = theme.fontSize[kebab(token)];
      expect([token, size, lineHeight]).toEqual([token, `${style.size}px`, `${style.size * style.lineHeight}px`]);
    }
  });

  it('keeps the nearly square corners', () => {
    expect(theme.borderRadius.lg).toBe(`${radius.lg}px`);
    expect(theme.borderRadius.full).toBe('9999px');
  });

  it('names the touch target so a control can ask for it', () => {
    expect(theme.minHeight.touch).toBe('44px');
    expect(theme.minWidth.touch).toBe('44px');
  });
});
