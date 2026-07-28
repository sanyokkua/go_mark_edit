import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

const tokensSource = readSource('src/ui/styles/tokens.css');
const shellStylesSource = readSource('src/ui/widgets/AppShell.module.css');
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
it('keepsThemeIdentityTokensStableAcrossModes', (): void => {
  expect(appliedToken('material', 'light', '--accent')).toBe('#4f6bed');
  expect(appliedToken('material', 'dark', '--accent')).toBe('#4f6bed');
  expect(appliedToken('minimal', 'light', '--win-radius')).toBe('12px');
  expect(appliedToken('minimal', 'dark', '--win-radius')).toBe('12px');
});

// Proves: themes-and-appearance#status-colours-follow-appearance
it('usesSameStatusTokensForThemesInAMode', (): void => {
  expect(appliedToken('glass', 'light', '--err')).toBe('#b3261e');
  expect(appliedToken('minimal', 'light', '--err')).toBe('#b3261e');
  expect(appliedToken('glass', 'dark', '--err')).toBe('#ff7a90');
  expect(appliedToken('minimal', 'dark', '--err')).toBe('#ff7a90');
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
