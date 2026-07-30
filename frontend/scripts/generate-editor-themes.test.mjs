// Proves: themes-and-appearance#editor-theme-is-generated
import assert from 'node:assert/strict';
import test from 'node:test';

import { generateEditorThemes } from './generate-editor-themes.mjs';

const materialPalette = `
:root[data-theme='material'][data-mode='light'] {
  --app-bg: #faf8ff; --surface: #ffffff; --stroke: #e3e1ee; --text: #1b1b22;
  --gutter: #c9ccd3; --accent: #4f6bed; --accent-soft: #dfe4ff;
  --selection-bg: #dfe4ff; --hover: rgba(0,0,0,.05); --scrollbar-thumb: #aeb6c9;
  --scrollbar-thumb-hover: #8994ad; --err: #b3261e; --warn: #b7791f;
  --md-heading: #3056d3; --md-strong: #b45309; --md-emphasis: #7c3aed;
  --md-quote: #0369a1; --md-link: #be123c; --md-comment: #9aa1ab;
  --md-marker: #9aa1ab; --code-fg: #30343b; --hl-keyword: #7c3aed;
  --hl-string: #0369a1; --hl-comment: #9aa1ab; --hl-number: #b45309;
  --hl-function: #3056d3; --hl-type: #0f766e; --hl-attr: #be123c; --hl-punct: #5c5c69;
}
:root[data-theme='material'][data-mode='dark'] {
  --app-bg: #171820; --surface: #20212b; --stroke: #3c4050; --text: #eef0f8;
  --gutter: rgba(255,255,255,.22); --accent: #4f6bed; --accent-soft: #dfe4ff;
  --selection-bg: #3a4b87; --hover: rgba(255,255,255,.16); --scrollbar-thumb: #555b70;
  --scrollbar-thumb-hover: #707892; --err: #ff7a90; --warn: #ffcf6b;
  --md-heading: #8fb4ff; --md-strong: #ffd479; --md-emphasis: #c58bff;
  --md-quote: #7fe3b5; --md-link: #ff9d7a; --md-comment: #8a93b8;
  --md-marker: #8a93b8; --code-fg: #dfe6ff; --hl-keyword: #c58bff;
  --hl-string: #7fe3b5; --hl-comment: #8a93b8; --hl-number: #ffd479;
  --hl-function: #8fb4ff; --hl-type: #5eead4; --hl-attr: #ff9d7a; --hl-punct: #9aa1ab;
}
`;

const palette = ['glass', 'material', 'minimal']
  .map((theme) => materialPalette.replaceAll("data-theme='material'", `data-theme='${theme}'`))
  .join('\n');

test('generates six complete named Monaco themes from palette values', () => {
  const generated = generateEditorThemes(palette);

  assert.deepEqual(
    Object.keys(generated.themes),
    ['gme-glass-light', 'gme-glass-dark', 'gme-material-light', 'gme-material-dark', 'gme-minimal-light', 'gme-minimal-dark'],
  );
  assert.equal(generated.themes['gme-material-light'].colors['editor.background'], '#faf8ff');
  assert.equal(generated.themes['gme-material-dark'].rules.find((rule) => rule.token === 'keyword').foreground, '#c58bff');
  assert.match(generated.highlightCss, /hljs-keyword/);
});

// Proves: themes-and-appearance#two-syntax-palettes
test('shares each fenced-language value by appearance across themes', () => {
  const generated = generateEditorThemes(palette);

  assert.equal(
    generated.themes['gme-glass-light'].rules.find((rule) => rule.token === 'keyword').foreground,
    generated.themes['gme-minimal-light'].rules.find((rule) => rule.token === 'keyword').foreground,
  );
});

// Proves: themes-and-appearance#editor-theme-is-generated
test('rejects a palette missing a required Monaco token', () => {
  assert.throws(
    () => generateEditorThemes(palette.replace('--hl-punct: #5c5c69;', '')),
    /--hl-punct/,
  );
});
