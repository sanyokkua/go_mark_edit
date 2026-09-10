import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const bootstrap = readFileSync(
  resolve(process.cwd(), 'public/theme-bootstrap.js'),
  'utf8',
);
const index = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

function runMirror(
  value: string | null,
  prefersDark = false,
): Record<string, string> {
  const attributes = new Map<string, string>();
  const context = {
    document: {
      documentElement: {
        setAttribute: (name: string, current: string): void => {
          attributes.set(name, current);
        },
      },
    },
    localStorage: { getItem: (): string | null => value },
    matchMedia: () => ({ matches: prefersDark }),
  } as Record<string, unknown> & { globalThis?: unknown };
  context.globalThis = context;
  vm.runInNewContext(bootstrap, context);
  return Object.fromEntries(attributes);
}

it('applies only a current valid startup mirror before application code', () => {
  expect(
    runMirror(JSON.stringify({ version: 1, theme: 'glass', mode: 'dark' })),
  ).toEqual({ 'data-theme': 'glass', 'data-mode': 'dark' });
  for (const value of [
    null,
    '{bad json',
    JSON.stringify({ version: 0, theme: 'glass', mode: 'dark' }),
    JSON.stringify({ version: 1, theme: 'retro', mode: 'dark' }),
  ]) {
    expect(runMirror(value)).toEqual({
      'data-theme': 'material',
      'data-mode': 'light',
    });
  }
});

it('resolves a current Auto mirror from the operating-system preference', () => {
  const mirror = JSON.stringify({ version: 1, theme: 'minimal', mode: 'auto' });
  expect(runMirror(mirror, false)['data-mode']).toBe('light');
  expect(runMirror(mirror, true)['data-mode']).toBe('dark');
});

it('runs the blocking bootstrap before the application module', () => {
  expect(index.indexOf('/theme-bootstrap.js')).toBeLessThan(
    index.indexOf('./src/main.tsx'),
  );
});
