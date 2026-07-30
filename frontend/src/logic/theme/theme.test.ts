import {
  applyThemeToRoot,
  normalizeAppearance,
  normalizeTheme,
  observeSystemAppearance,
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

it('subscribes to system appearance only while Auto is selected', (): void => {
  const listener = jest.fn();
  const media = {
    matches: false,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  };
  const matchMedia = jest.fn(() => media);

  const noSubscription = observeSystemAppearance('dark', matchMedia, listener);
  expect(matchMedia).not.toHaveBeenCalled();
  noSubscription();

  const dispose = observeSystemAppearance('auto', matchMedia, listener);
  expect(matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
  expect(media.addEventListener).toHaveBeenCalledWith(
    'change',
    expect.any(Function),
  );
  const handler = media.addEventListener.mock.calls[0][1] as (event: {
    matches: boolean;
  }) => void;
  handler({ matches: true });
  expect(listener).toHaveBeenCalledWith('dark');
  dispose();
  expect(media.removeEventListener).toHaveBeenCalledWith('change', handler);
});
