import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { useLocales } from 'expo-localization';
import { useTranslations } from 'use-intl';
import { I18nProvider, LOCALES, MESSAGES, pickLocale } from '@/i18n';

type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ''): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [[`${prefix}${key}`, value] as [string, string]] : leaves(value, `${prefix}${key}.`),
  );
}

// The names a message fills in: {shop}, {count, plural, ...}.
const argumentsOf = (message: string) => [...message.matchAll(/\{(\w+)[,}]/g)].map((match) => match[1]).sort();

const english = new Map(leaves(MESSAGES.en));

describe.each(LOCALES.filter((locale) => locale !== 'en'))('the %s messages', (locale) => {
  const translated = new Map(leaves(MESSAGES[locale]));

  it('have every English message, and no other', () => {
    expect([...translated.keys()].sort()).toEqual([...english.keys()].sort());
  });

  it('fill in the same values as the English ones', () => {
    for (const [key, message] of translated) {
      expect([key, argumentsOf(message)]).toEqual([key, argumentsOf(english.get(key) ?? '')]);
    }
  });
});

describe('the language', () => {
  it("follows the phone's first language Hold speaks", () => {
    expect(pickLocale([{ languageCode: 'pt' }, { languageCode: 'de' }])).toBe('de');
    expect(pickLocale([{ languageCode: 'fr' }])).toBe('fr');
  });

  it('is English when the phone speaks none of them', () => {
    expect(pickLocale([{ languageCode: 'ja' }])).toBe('en');
    expect(pickLocale([{ languageCode: null }])).toBe('en');
  });

  function Tagline() {
    const t = useTranslations('start');
    return <Text>{t('tagline')}</Text>;
  }

  it('shows the messages in that language', async () => {
    jest.mocked(useLocales).mockReturnValue([{ languageCode: 'es', languageTag: 'es-ES' } as ReturnType<typeof useLocales>[0]]);
    await render(
      <I18nProvider>
        <Tagline />
      </I18nProvider>,
    );
    expect(screen.getByText('La fianza que nunca sale de tu cuenta.')).toBeOnTheScreen();
  });
});
