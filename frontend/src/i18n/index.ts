import {
  createTranslator,
  discoverLocaleResources,
  type LocaleCatalog,
} from './catalog';

export type { InterpolationValues } from './catalog';

const bundledResources = import.meta.glob('./locales/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, LocaleCatalog>;
const translator = createTranslator(discoverLocaleResources(bundledResources));

export const { availableLocales, formatNumber, setLocale, t } = translator;
