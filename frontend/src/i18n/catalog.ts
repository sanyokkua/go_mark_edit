export type InterpolationValues = Readonly<Record<string, number | string>>;

export type LocaleCatalog = Readonly<Record<string, string>>;

export type LocaleResources = Readonly<Record<string, LocaleCatalog>>;

export interface Translator {
  availableLocales: readonly string[];
  formatNumber: (value: number) => string;
  setLocale: (locale: string) => void;
  t: (key: string, values?: InterpolationValues) => string;
}

function nonBlankValue(value: string | undefined): string | undefined {
  return value === undefined || value.trim().length === 0 ? undefined : value;
}

function interpolate(template: string, values: InterpolationValues): string {
  return template.replace(
    /\{([^{}]+)\}/gu,
    (placeholder: string, name: string): string => {
      const value = values[name];

      return value === undefined ? placeholder : String(value);
    },
  );
}

export function discoverLocaleResources(
  bundledResources: Readonly<Record<string, LocaleCatalog>>,
): LocaleResources {
  const localeResources: Record<string, LocaleCatalog> = {};

  for (const [path, catalog] of Object.entries(bundledResources)) {
    const match = /\/([^/]+)\.json$/u.exec(path);

    if (match !== null) {
      localeResources[match[1]] = catalog;
    }
  }

  return localeResources;
}

export function createTranslator(
  localeResources: LocaleResources,
  fallbackLocale = 'en',
): Translator {
  const availableLocales: readonly string[] = Object.freeze(
    Object.keys(localeResources).sort(),
  );
  let activeLocale =
    localeResources[fallbackLocale] === undefined
      ? (availableLocales[0] ?? fallbackLocale)
      : fallbackLocale;

  return {
    availableLocales,
    formatNumber(value: number): string {
      try {
        return new Intl.NumberFormat(activeLocale).format(value);
      } catch {
        return new Intl.NumberFormat(fallbackLocale).format(value);
      }
    },
    setLocale(locale: string): void {
      activeLocale =
        localeResources[locale] === undefined ? fallbackLocale : locale;
    },
    t(key: string, values: InterpolationValues = {}): string {
      const activeValue = nonBlankValue(localeResources[activeLocale]?.[key]);
      const fallbackValue = nonBlankValue(
        localeResources[fallbackLocale]?.[key],
      );

      return interpolate(activeValue ?? fallbackValue ?? key, values);
    },
  };
}
