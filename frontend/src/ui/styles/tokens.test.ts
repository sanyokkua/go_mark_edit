import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

const tokensSource = readSource('src/ui/styles/tokens.css');
const baseStylesSource = readSource('src/ui/styles/base.css');
const shellStylesSource = readSource('src/ui/widgets/AppShell.module.css');
const currentSurfaceStyles = [
  'src/ui/widgets/AppShell.module.css',
  'src/ui/widgets/AppearanceControls.module.css',
  'src/ui/widgets/AppearanceDialog.module.css',
  'src/ui/widgets/EditorView.module.css',
  'src/ui/widgets/SettingsMenu.module.css',
  'src/ui/components/StatusBar.module.css',
].map(readSource);
const colorLiteralPattern = /#[\da-f]{3,8}\b|rgba?\(|hsla?\(/i;
const shellTokenPattern = /var\((--shell-[\w-]+)\)/g;

function appliedToken(theme: string, mode: string, token: string): string {
  const stylesheet = installTokens();
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.setAttribute('data-mode', mode);
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(token)
    .trim();
  stylesheet.remove();
  return value;
}

function installTokens(): HTMLStyleElement {
  const stylesheet = document.createElement('style');
  stylesheet.textContent = tokensSource;
  document.head.append(stylesheet);
  return stylesheet;
}

// Proves: STORY-007-AC-2
it('STORY-007-AC-2 supplies the shell through tokens only', () => {
  const definedTokens = Array.from(
    tokensSource.matchAll(/^\s*(--shell-[\w-]+)\s*:/gm),
    ([, token]: RegExpMatchArray): string => token,
  );
  const consumedTokens = Array.from(
    shellStylesSource.matchAll(shellTokenPattern),
    ([, token]: RegExpMatchArray): string => token,
  );

  expect(definedTokens).toEqual([
    '--shell-left-width',
    '--shell-center-min-width',
    '--shell-assistant-collapsed-width',
    '--shell-assistant-visible-width',
  ]);
  expect(consumedTokens).toEqual([
    '--shell-left-width',
    '--shell-center-min-width',
    '--shell-assistant-collapsed-width',
    '--shell-left-width',
    '--shell-center-min-width',
    '--shell-assistant-visible-width',
  ]);
  expect(shellStylesSource).not.toMatch(colorLiteralPattern);
  expect(tokensSource).toContain('--accent');
});

// Proves: themes-and-appearance#theme-identity-is-stable
it('usesTheBindingAccentForEachMaterialAppearance', (): void => {
  expect(appliedToken('material', 'light', '--accent')).toBe('#4f6bed');
  expect(appliedToken('material', 'dark', '--accent')).toBe('#b3c2ff');
  expect(appliedToken('minimal', 'light', '--win-radius')).toBe('12px');
  expect(appliedToken('minimal', 'dark', '--win-radius')).toBe('12px');
});

// Proves: appearance-contract#status-colours-follow-the-mockup
it('usesMockupSpecificStatusTokensForThemesInAMode', (): void => {
  expect(appliedToken('glass', 'light', '--err')).toBe('#c0324b');
  expect(appliedToken('minimal', 'light', '--err')).toBe('#b91c1c');
  expect(appliedToken('glass', 'dark', '--err')).toBe('#ff7a90');
  expect(appliedToken('minimal', 'dark', '--err')).toBe('#f87171');
});

it('usesTheBindingCanvasAndSurfaceAliasesForLiquidGlass', (): void => {
  expect(baseStylesSource).toContain('background: var(--canvas);');
  expect(appliedToken('glass', 'light', '--surface-raised')).toBe(
    'var(--elevated)',
  );
  expect(appliedToken('glass', 'dark', '--surface-raised')).toBe(
    'var(--elevated)',
  );
  expect(appliedToken('glass', 'light', '--border')).toBe('var(--stroke)');
  expect(appliedToken('glass', 'dark', '--text-muted')).toBe('var(--muted)');
});

// Proves: themes-and-appearance#fonts-are-bundled
it('loadsBundledRobotoAndInterFaces', (): void => {
  const stylesheet = installTokens();
  const faces = Array.from(stylesheet.sheet?.cssRules ?? []).filter(
    (rule): rule is CSSFontFaceRule => rule.type === CSSRule.FONT_FACE_RULE,
  );

  expect(
    faces.map((face) => face.style.getPropertyValue('font-family')),
  ).toEqual(['GME Inter', 'GME Roboto']);
  expect(
    faces.every((face) =>
      face.style.getPropertyValue('src').includes('.woff2'),
    ),
  ).toBe(true);
  stylesheet.remove();
});

// Proves: themes-and-appearance#interaction-tokens
it('exposesSelectionFocusAndScrollbarTokens', (): void => {
  expect(appliedToken('glass', 'dark', '--selection-bg')).not.toBe('');
  expect(appliedToken('glass', 'dark', '--focus-ring')).toContain('--accent');
  expect(appliedToken('glass', 'dark', '--scrollbar-thumb')).not.toBe('');
});

// Proves: themes-and-appearance#stacking-scale
it('definesEightNamedStackingTokens', (): void => {
  expect(appliedToken('material', 'light', '--z-toast')).toBe('90');
  expect(appliedToken('material', 'light', '--z-modal')).toBe('70');
});

// Proves: themes-and-appearance#motion-tokens
it('removesTokenizedMotionWhenReducedMotionIsRequested', (): void => {
  const stylesheet = installTokens();
  const reducedMotionRule = Array.from(stylesheet.sheet?.cssRules ?? []).find(
    (rule): rule is CSSMediaRule => {
      const mediaRule = rule as CSSMediaRule;
      return (
        rule.type === CSSRule.MEDIA_RULE &&
        mediaRule.media.mediaText === '(prefers-reduced-motion: reduce)'
      );
    },
  );

  expect(reducedMotionRule?.cssRules[0]?.cssText).toContain('--dur-fast: 0ms');
  expect(reducedMotionRule?.cssRules[0]?.cssText).toContain('--dur-base: 0ms');
  expect(reducedMotionRule?.cssRules[0]?.cssText).toContain('--dur-slow: 0ms');
  stylesheet.remove();
});

const palettes = [
  ['glass', 'light'],
  ['glass', 'dark'],
  ['material', 'light'],
  ['material', 'dark'],
  ['minimal', 'light'],
  ['minimal', 'dark'],
] as const;

const requiredPaletteTokens = [
  '--canvas',
  '--app-bg',
  '--surface',
  '--surface-2',
  '--surface-3',
  '--elevated',
  '--stroke',
  '--stroke-soft',
  '--text',
  '--muted',
  '--faint',
  '--accent',
  '--accent2',
  '--accent-ink',
  '--accent-soft',
  '--accent-contrast',
  '--ok',
  '--warn',
  '--err',
  '--hover',
  '--selection-bg',
  '--selection-fg',
  '--scrollbar-track',
  '--scrollbar-thumb',
  '--scrollbar-thumb-hover',
  '--focus-ring',
  '--gutter',
  '--code-fg',
  '--md-heading',
  '--md-strong',
  '--md-emphasis',
  '--md-quote',
  '--md-comment',
  '--md-link',
  '--md-marker',
  '--hl-keyword',
  '--hl-string',
  '--hl-comment',
  '--hl-number',
  '--hl-function',
  '--hl-type',
  '--hl-attr',
  '--hl-punct',
  '--z-base',
  '--z-sticky',
  '--z-resize',
  '--z-dropdown',
  '--z-overlay',
  '--z-modal',
  '--z-popover',
  '--z-toast',
  '--dur-fast',
  '--dur-base',
  '--dur-slow',
] as const;

it('suppliesEveryAppearanceContractTokenAcrossAllSixPalettes', (): void => {
  for (const [theme, mode] of palettes) {
    for (const token of requiredPaletteTokens) {
      expect(appliedToken(theme, mode, token)).not.toBe('');
    }
  }
});

it('sharesSyntaxTokensByResolvedAppearance', (): void => {
  const syntaxTokens = requiredPaletteTokens.filter(
    (token) =>
      token.startsWith('--md-') ||
      token.startsWith('--hl-') ||
      token === '--code-fg' ||
      token === '--gutter',
  );
  for (const mode of ['light', 'dark']) {
    for (const token of syntaxTokens) {
      expect(appliedToken('glass', mode, token)).toBe(
        appliedToken('material', mode, token),
      );
      expect(appliedToken('material', mode, token)).toBe(
        appliedToken('minimal', mode, token),
      );
    }
  }
});

it('usesTheBindingMockupStatusValuesForEveryPalette', (): void => {
  expect(appliedToken('glass', 'light', '--ok')).toBe('#149e63');
  expect(appliedToken('glass', 'light', '--warn')).toBe('#b7791f');
  expect(appliedToken('glass', 'light', '--err')).toBe('#c0324b');
  expect(appliedToken('glass', 'dark', '--ok')).toBe('#39d98a');
  expect(appliedToken('glass', 'dark', '--warn')).toBe('#ffcf6b');
  expect(appliedToken('glass', 'dark', '--err')).toBe('#ff7a90');
  expect(appliedToken('material', 'light', '--ok')).toBe('#1f8a54');
  expect(appliedToken('material', 'light', '--warn')).toBe('#8a5a00');
  expect(appliedToken('material', 'light', '--err')).toBe('#b3261e');
  expect(appliedToken('material', 'dark', '--ok')).toBe('#5bd08b');
  expect(appliedToken('material', 'dark', '--warn')).toBe('#ffcf6b');
  expect(appliedToken('material', 'dark', '--err')).toBe('#ffb4ab');
  expect(appliedToken('minimal', 'light', '--ok')).toBe('#059669');
  expect(appliedToken('minimal', 'light', '--warn')).toBe('#b45309');
  expect(appliedToken('minimal', 'light', '--err')).toBe('#b91c1c');
  expect(appliedToken('minimal', 'dark', '--ok')).toBe('#34d399');
  expect(appliedToken('minimal', 'dark', '--warn')).toBe('#fbbf24');
  expect(appliedToken('minimal', 'dark', '--err')).toBe('#f87171');
});

it('routes every current appearance surface through palette tokens', (): void => {
  for (const source of currentSurfaceStyles) {
    expect(source).toMatch(/var\(--[\w-]+\)/);
    expect(source).not.toMatch(colorLiteralPattern);
  }
  for (const [theme, mode] of palettes) {
    for (const token of [
      '--app-bg',
      '--surface',
      '--surface-raised',
      '--text',
      '--border',
      '--selection-bg',
      '--scrollbar-thumb',
      '--focus-ring',
    ]) {
      expect(appliedToken(theme, mode, token)).not.toBe('');
    }
  }
});
