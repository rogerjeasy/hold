import type { Config } from 'tailwindcss';
import { font, kebab, radius, size, tailwindColors, type } from '@hold/design-tokens';

// The Tailwind theme, generated from @hold/design-tokens. Colours, fonts, text sizes and radii REPLACE Tailwind's
// defaults, so only Hold's values exist as classes (`bg-card`, `text-muted-foreground`, `font-display`, `text-title`,
// `rounded-lg`). Spacing keeps Tailwind's 4-point scale. Colours are CSS variables that src/theme sets per theme, so one
// class works in light and dark; an opacity modifier (`bg-primary/50`) therefore does not work.
const px = (value: number) => `${value}px`;
const byClassName = <Value, Result>(tokens: Record<string, Value>, map: (value: Value) => Result) =>
  Object.fromEntries(Object.entries(tokens).map(([token, value]) => [kebab(token), map(value)]));

const config: Config = {
  // Themes switch through CSS variables, not `dark:` classes.
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Tailwind loads presets by require.
  presets: [require('nativewind/preset')],
  theme: {
    colors: { transparent: 'transparent', ...tailwindColors() },
    fontFamily: byClassName(font, (file) => [file]),
    fontSize: byClassName(type, (style) => [
      px(style.size),
      {
        lineHeight: px(style.size * style.lineHeight),
        ...('letterSpacing' in style ? { letterSpacing: px(style.size * style.letterSpacing) } : {}),
      },
    ]),
    borderRadius: { none: '0px', ...byClassName(radius, px), full: '9999px' },
    extend: {
      minHeight: { touch: px(size.minTouchTarget) },
      minWidth: { touch: px(size.minTouchTarget) },
      maxWidth: { prose: px(size.proseMaxWidth), content: px(size.contentMaxWidth) },
    },
  },
  plugins: [],
};

export default config;
