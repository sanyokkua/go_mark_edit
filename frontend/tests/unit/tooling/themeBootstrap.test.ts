import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const bootstrap = readFileSync(resolve(process.cwd(), 'public/theme-bootstrap.js'), 'utf8');
const index = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

function runMirror(
    value: string | null,
    prefersDark: boolean | null = false,
): { theme: string | null; mode: string | null } {
    const startupDocument = document.implementation.createHTMLDocument();
    if (value === null) localStorage.removeItem('gme.theme');
    else localStorage.setItem('gme.theme', value);

    vm.runInNewContext(bootstrap, {
        document: startupDocument,
        localStorage,
        matchMedia: prefersDark === null ? undefined : () => ({ matches: prefersDark }),
    });
    const { documentElement } = startupDocument;
    return { theme: documentElement.getAttribute('data-theme'), mode: documentElement.getAttribute('data-mode') };
}

afterEach(() => localStorage.removeItem('gme.theme'));

it('applies only a current valid startup mirror before application code', () => {
    expect(runMirror(JSON.stringify({ version: 1, theme: 'glass', mode: 'light' }), true)).toEqual({
        theme: 'glass',
        mode: 'light',
    });
    expect(runMirror(JSON.stringify({ version: 1, theme: 'glass', mode: 'dark' }))).toEqual({
        theme: 'glass',
        mode: 'dark',
    });
    for (const value of [
        null,
        '{bad json',
        JSON.stringify({ version: 0, theme: 'glass', mode: 'dark' }),
        JSON.stringify({ version: 1, theme: 'retro', mode: 'dark' }),
        JSON.stringify({ version: 1, theme: 'glass', mode: 'sepia' }),
    ]) {
        expect(runMirror(value)).toEqual({
            theme: 'material',
            mode: 'light',
        });
    }
});

it('resolves a current Auto mirror from the operating-system preference', () => {
    const mirror = JSON.stringify({ version: 1, theme: 'minimal', mode: 'auto' });
    expect(runMirror(mirror, false)).toEqual({ theme: 'minimal', mode: 'light' });
    expect(runMirror(mirror, true)).toEqual({ theme: 'minimal', mode: 'dark' });
    expect(runMirror(null, true)).toEqual({ theme: 'material', mode: 'dark' });
});

it('applies a light palette for Auto when the operating-system preference is unavailable', () => {
    expect(runMirror(JSON.stringify({ version: 1, theme: 'minimal', mode: 'auto' }), null)).toEqual({
        theme: 'minimal',
        mode: 'light',
    });
    expect(runMirror(null, null)).toEqual({ theme: 'material', mode: 'light' });
});

it('runs the blocking bootstrap before the application module', () => {
    expect(index.indexOf('/theme-bootstrap.js')).toBeLessThan(index.indexOf('./src/main.tsx'));
});
