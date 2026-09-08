import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const directory = dirname(fileURLToPath(import.meta.url));
const bootstrap = readFileSync(
  resolve(directory, 'theme-bootstrap.js'),
  'utf8',
);
const index = readFileSync(resolve(directory, '../index.html'), 'utf8');

function runMirror(value, prefersDark = false) {
  const attributes = new Map();
  const context = {
    document: {
      documentElement: {
        setAttribute: (name, current) => attributes.set(name, current),
      },
    },
    localStorage: { getItem: () => value },
    matchMedia: () => ({ matches: prefersDark }),
  };
  context.globalThis = context;
  vm.runInNewContext(bootstrap, context);
  return Object.fromEntries(attributes);
}

test('applies only a current valid startup mirror before application code', () => {
  assert.deepEqual(
    runMirror(JSON.stringify({ version: 1, theme: 'glass', mode: 'dark' })),
    { 'data-theme': 'glass', 'data-mode': 'dark' },
  );
  for (const value of [
    null,
    '{bad json',
    JSON.stringify({ version: 0, theme: 'glass', mode: 'dark' }),
    JSON.stringify({ version: 1, theme: 'retro', mode: 'dark' }),
  ]) {
    assert.deepEqual(runMirror(value), {
      'data-theme': 'material',
      'data-mode': 'light',
    });
  }
});

test('resolves a current Auto mirror from the operating-system preference', () => {
  const mirror = JSON.stringify({ version: 1, theme: 'minimal', mode: 'auto' });
  assert.equal(runMirror(mirror, false)['data-mode'], 'light');
  assert.equal(runMirror(mirror, true)['data-mode'], 'dark');
});

test('runs the blocking bootstrap before the application module', () => {
  assert.ok(
    index.indexOf('/theme-bootstrap.js') < index.indexOf('./src/main.tsx'),
  );
});
