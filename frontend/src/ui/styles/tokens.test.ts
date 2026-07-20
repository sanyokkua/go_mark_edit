import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

const tokensSource = readSource('src/ui/styles/tokens.css');
const shellStylesSource = readSource('src/ui/widgets/AppShell.module.css');
const colorLiteralPattern = /#[\da-f]{3,8}\b|rgba?\(|hsla?\(/i;
const shellTokenPattern = /var\((--shell-[\w-]+)\)/g;

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
  expect(tokensSource).not.toMatch(colorLiteralPattern);
});
