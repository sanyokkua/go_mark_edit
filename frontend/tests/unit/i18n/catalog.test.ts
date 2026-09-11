import {
  createTranslator,
  discoverLocaleResources,
} from '../../../src/i18n/catalog';

it('interpolates status labels and formats word counts by active locale', () => {
  const translator = createTranslator(
    discoverLocaleResources({
      './locales/de.json': {
        'status.arrangement.split': 'Geteilt',
        'status.cursor': 'Zeile {line}, Spalte {column}',
        'status.encoding.utf-8': 'UTF-8',
        'status.lineEnding.lf': 'LF',
        'status.words': '{count} Woerter',
      },
      './locales/en.json': {
        'status.arrangement.split': 'Split',
        'status.cursor': 'Ln {line}, Col {column}',
        'status.encoding.utf-8': 'UTF-8',
        'status.lineEnding.lf': 'LF',
        'status.words': '{count} words',
      },
    }),
  );

  translator.setLocale('de');

  expect(translator.t('status.cursor', { column: 8, line: 3 })).toBe(
    'Zeile 3, Spalte 8',
  );
  expect(translator.t('status.words', { count: 1200 })).toBe('1200 Woerter');
  expect(translator.formatNumber(1200)).toBe(
    new Intl.NumberFormat('de').format(1200),
  );
  expect(translator.t('status.encoding.utf-8')).toBe('UTF-8');
  expect(translator.t('status.lineEnding.lf')).toBe('LF');
  expect(translator.t('status.arrangement.split')).toBe('Geteilt');
});

it('EC-I18N-1 falls back to English and then the key without a blank label', () => {
  const translator = createTranslator(
    discoverLocaleResources({
      './locales/en.json': {
        'status.cursor': 'Ln {line}, Col {column}',
        'status.words': '{count} words',
      },
      './locales/fr.json': {
        'status.cursor': '   ',
      },
    }),
  );

  translator.setLocale('fr');

  expect(translator.t('status.cursor', { column: 2, line: 4 })).toBe(
    'Ln 4, Col 2',
  );
  expect(translator.t('status.words', { count: 0 })).toBe('0 words');
  expect(translator.t('status.missing')).toBe('status.missing');
});

it('EC-I18N-2 discovers a dropped-in locale resource without component changes', () => {
  const translator = createTranslator(
    discoverLocaleResources({
      './locales/en.json': { 'status.words': '{count} words' },
      './locales/hr.json': { 'status.words': '{count} rijeci' },
    }),
  );

  expect(translator.availableLocales).toEqual(['en', 'hr']);

  translator.setLocale('hr');
  expect(translator.t('status.words', { count: 7 })).toBe('7 rijeci');
});
