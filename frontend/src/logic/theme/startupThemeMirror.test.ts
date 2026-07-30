import {
  readStartupThemeMirror,
  writeStartupThemeMirror,
} from './startupThemeMirror';

beforeEach((): void => localStorage.clear());

it('reads only valid theme and appearance choices with Material/Auto fallback', (): void => {
  expect(readStartupThemeMirror(localStorage)).toEqual({
    theme: 'material',
    mode: 'auto',
  });
  localStorage.setItem(
    'gme.theme',
    JSON.stringify({ version: 1, theme: 'glass', mode: 'dark' }),
  );
  expect(readStartupThemeMirror(localStorage)).toEqual({
    theme: 'glass',
    mode: 'dark',
  });
  localStorage.setItem('gme.theme', '{not json');
  expect(readStartupThemeMirror(localStorage)).toEqual({
    theme: 'material',
    mode: 'auto',
  });
  localStorage.setItem(
    'gme.theme',
    JSON.stringify({ version: 0, theme: 'glass', mode: 'dark' }),
  );
  expect(readStartupThemeMirror(localStorage)).toEqual({
    theme: 'material',
    mode: 'auto',
  });
});

it('writes only the acknowledged theme and choice', (): void => {
  writeStartupThemeMirror(localStorage, { theme: 'minimal', mode: 'light' });
  expect(JSON.parse(localStorage.getItem('gme.theme') ?? '')).toEqual({
    version: 1,
    theme: 'minimal',
    mode: 'light',
  });
});
