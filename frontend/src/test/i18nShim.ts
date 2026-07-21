import englishCatalog from '../i18n/locales/en.json';
import { createTranslator } from '../i18n/catalog';

export type { InterpolationValues } from '../i18n/catalog';

const translator = createTranslator({ en: englishCatalog });

export const { availableLocales, formatNumber, setLocale, t } = translator;
