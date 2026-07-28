import {
  applyThemeToRoot,
  normalizeAppearance,
  normalizeTheme,
  resolveAppearance,
} from './theme';

// Proves: themes-and-appearance#three-themes
it('normalizes only the three documented themes', (): void => {
  expect(normalizeTheme('glass')).toBe('glass');
  expect(normalizeTheme('material')).toBe('material');
  expect(normalizeTheme('minimal')).toBe('minimal');
  expect(normalizeTheme('dracula')).toBe('material');
});

// Proves: themes-and-appearance#choice-and-resolved-are-separate
it('keeps the auto choice while applying the resolved mode', (): void => {
  const resolveSystemDark = (): boolean => true;

  expect(normalizeAppearance('auto')).toBe('auto');
  expect(resolveAppearance('auto', resolveSystemDark)).toBe('dark');
  expect(resolveAppearance('light', resolveSystemDark)).toBe('light');
});

// Proves: themes-and-appearance#tokens-on-the-root-element
it('sets attributes only on the document element', (): void => {
  const root = document.documentElement;
  const child = document.createElement('main');
  document.body.append(child);

  applyThemeToRoot({ mode: 'dark', theme: 'glass' }, document);

  expect(root).toHaveAttribute('data-theme', 'glass');
  expect(root).toHaveAttribute('data-mode', 'dark');
  expect(child).not.toHaveAttribute('data-theme');
  expect(child).not.toHaveAttribute('data-mode');

  child.remove();
});
