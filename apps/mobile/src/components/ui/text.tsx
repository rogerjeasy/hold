import { Text as NativeText, type TextProps as NativeTextProps } from 'react-native';
import type { TypeToken } from '@hold/design-tokens';

// Class names are written out in full so Tailwind finds them. Keyed by the type tokens, so a new type style without a
// class here does not compile.
const VARIANT: Readonly<Record<TypeToken, string>> = {
  display: 'font-display text-display',
  headline: 'font-display text-headline',
  pageTitle: 'font-display text-page-title',
  title: 'font-display text-title',
  figure: 'font-display text-figure',
  lead: 'font-body text-lead',
  heading: 'font-display text-heading',
  body: 'font-body text-body',
  bodyStrong: 'font-body-semibold text-body-strong',
  button: 'font-body-semibold text-button',
  small: 'font-body text-small',
  label: 'font-label text-label uppercase',
  tag: 'font-label text-tag uppercase',
  code: 'font-figure text-code',
};

const TONE = {
  default: 'text-foreground',
  muted: 'text-muted-foreground',
  primary: 'text-primary',
  destructive: 'text-destructive',
  success: 'text-success',
  warning: 'text-warning',
  onPrimary: 'text-primary-foreground',
  onContrast: 'text-contrast-foreground',
  onPhoto: 'text-photo-foreground',
  inherit: '',
} as const;

export type TextTone = keyof typeof TONE;

export type TextProps = NativeTextProps & { variant?: TypeToken; tone?: TextTone; className?: string };

// The only text in the app. It follows the phone's text size: never turn allowFontScaling off, let layouts grow.
export function Text({ variant = 'body', tone = 'default', className, ...rest }: TextProps) {
  return <NativeText {...rest} className={[VARIANT[variant], TONE[tone], className].filter(Boolean).join(' ')} />;
}
