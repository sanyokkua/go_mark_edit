import {
  createTranslator,
  type LocaleCatalog,
} from './catalog';
import englishCatalog from './locales/en.json';

export type { InterpolationValues } from './catalog';

const bundledResources: Record<string, LocaleCatalog> = { en: englishCatalog };
const translator = createTranslator(bundledResources);

export const { availableLocales, formatNumber, setLocale, t } = translator;
