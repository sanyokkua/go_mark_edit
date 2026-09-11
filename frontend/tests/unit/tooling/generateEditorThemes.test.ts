import { generateEditorThemes } from '../../../scripts/generate-editor-themes-core.cjs';

interface GeneratedTheme {
  colors: Record<string, string>;
  rules: Array<{ foreground: string; token: string }>;
}

interface GeneratedOutput {
  highlightCss: string;
  themes: Record<string, GeneratedTheme>;
}

function generate(css: string): GeneratedOutput {
  return generateEditorThemes(css) as unknown as GeneratedOutput;
}

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
  .map((theme) =>
    materialPalette.replaceAll(
      "data-theme='material'",
      `data-theme='${theme}'`,
    ),
  )
  .join('\n');

it('generates six complete named Monaco themes from palette values', () => {
  const generated = generate(palette);

  expect(Object.keys(generated.themes)).toEqual([
    'gme-glass-light',
    'gme-glass-dark',
    'gme-material-light',
    'gme-material-dark',
    'gme-minimal-light',
    'gme-minimal-dark',
  ]);
  expect(
    generated.themes['gme-material-light'].colors['editor.background'],
  ).toBe('#faf8ff');
  expect(
    generated.themes['gme-material-dark'].rules.find(
      (rule) => rule.token === 'keyword.go',
    )?.foreground,
  ).toBe('#c58bff');
  expect(generated.highlightCss).toMatch(/hljs-keyword/);
});

it('converts CSS rgba palette values to Monaco-compatible hex', () => {
  const translucentPalette = palette.replace(
    ":root[data-theme='glass'][data-mode='light'] {\n  --app-bg: #faf8ff",
    ":root[data-theme='glass'][data-mode='light'] {\n  --app-bg: rgba(255,255,255,.42)",
  );
  expect(
    generate(translucentPalette).themes['gme-glass-light'].colors[
      'editor.background'
    ],
  ).toBe('#ffffff6b');
});

it('shares each fenced-language value by appearance across themes', () => {
  const generated = generate(palette);

  expect(
    generated.themes['gme-glass-light'].rules.find(
      (rule) => rule.token === 'keyword.go',
    )?.foreground,
  ).toBe(
    generated.themes['gme-minimal-light'].rules.find(
      (rule) => rule.token === 'keyword.go',
    )?.foreground,
  );
});

it('rejects a palette missing a required Monaco token', () => {
  expect(() => generate(palette.replace('--hl-punct: #5c5c69;', ''))).toThrow(
    /--hl-punct/,
  );
});

it('generates qualified Markdown and Go rules plus every required Monaco UI colour', () => {
  const generated = generate(palette);
  const theme = generated.themes['gme-material-light'];
  const rule = (token: string): string | undefined =>
    theme.rules.find((candidate) => candidate.token === token)?.foreground;

  for (const color of [
    'editor.background',
    'editor.foreground',
    'editorLineNumber.foreground',
    'editorLineNumber.activeForeground',
    'editorCursor.foreground',
    'editor.selectionBackground',
    'editor.selectionHighlightBackground',
    'editor.lineHighlightBackground',
    'editorGutter.background',
    'editorWidget.background',
    'editorWidget.border',
    'editorSuggestWidget.background',
    'editorSuggestWidget.foreground',
    'editorSuggestWidget.selectedBackground',
    'minimap.background',
    'scrollbarSlider.background',
    'scrollbarSlider.hoverBackground',
    'editorError.foreground',
    'editorWarning.foreground',
  ]) {
    expect(theme.colors[color]).toBeTruthy();
  }

  expect(rule('keyword.md')).toBe('#3056d3');
  expect(rule('keyword.md.*')).toBe('#3056d3');
  expect(rule('strong.md')).toBe('#b45309');
  expect(rule('comment.md.*')).toBe('#0369a1');
  expect(rule('string.link.md')).toBe('#be123c');
  expect(rule('keyword.go')).toBe('#7c3aed');
  expect(rule('keyword.go.*')).toBe('#7c3aed');
  expect(rule('comment.go.*')).toBe('#9aa1ab');
  expect(rule('number.go.*')).toBe('#b45309');
  expect(rule('delimiter.go.*')).toBe('#5c5c69');
  expect(rule('keyword.type.go')).toBe('#0f766e');
  expect(rule('keyword.const.go')).toBe('#0f766e');
});

it('rejects duplicate, unresolved, and unsupported palette sources', () => {
  expect(() =>
    generate(
      palette.replace(
        '--hl-punct: #5c5c69;',
        '--hl-punct: #5c5c69; --hl-punct: #000000;',
      ),
    ),
  ).toThrow(/Duplicate token --hl-punct/);
  expect(() =>
    generate(
      palette.replace('--hl-punct: #5c5c69;', '--hl-punct: var(--other);'),
    ),
  ).toThrow(/Unresolved token --hl-punct/);
  expect(() =>
    generate(
      `${palette}\n:root[data-theme='retro'][data-mode='light'] { --hl-punct: #000000; }`,
    ),
  ).toThrow(/Untraceable palette selector/);
});

it('emits inactive highlight rules for every generated syntax token', () => {
  const generated = generate(palette);
  for (const token of [
    'hljs-keyword',
    'hljs-string',
    'hljs-comment',
    'hljs-number',
    'hljs-title',
    'hljs-type',
    'hljs-attr',
    'hljs-punctuation',
  ]) {
    expect(generated.highlightCss).toMatch(new RegExp(`\\.${token}`));
  }
});
