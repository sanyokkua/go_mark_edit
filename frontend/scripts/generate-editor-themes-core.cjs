const { readFile, writeFile } = require('node:fs/promises');
const { resolve } = require('node:path');

const themes = ['glass', 'material', 'minimal'];
const modes = ['light', 'dark'];
const required = [
  '--app-bg',
  '--surface',
  '--stroke',
  '--text',
  '--gutter',
  '--accent',
  '--accent-soft',
  '--selection-bg',
  '--hover',
  '--scrollbar-thumb',
  '--scrollbar-thumb-hover',
  '--err',
  '--warn',
  '--md-heading',
  '--md-strong',
  '--md-emphasis',
  '--md-quote',
  '--md-link',
  '--md-comment',
  '--md-marker',
  '--code-fg',
  '--hl-keyword',
  '--hl-string',
  '--hl-comment',
  '--hl-number',
  '--hl-function',
  '--hl-type',
  '--hl-attr',
  '--hl-punct',
];

const markdownRules = [
  ['keyword.md', '--md-heading'],
  ['keyword.md.*', '--md-heading'],
  ['meta.separator.md', '--md-marker'],
  ['keyword.table.md.*', '--md-marker'],
  ['strong.md', '--md-strong'],
  ['strong.md.*', '--md-strong'],
  ['emphasis.md', '--md-emphasis'],
  ['emphasis.md.*', '--md-emphasis'],
  ['comment.md', '--md-quote'],
  ['comment.md.*', '--md-quote'],
  ['string.link.md', '--md-link'],
  ['string.target.md', '--md-link'],
  ['string.md', '--md-comment'],
  ['variable.source.md', '--code-fg'],
];
const goRules = [
  ['keyword.go', '--hl-keyword'],
  ['keyword.go.*', '--hl-keyword'],
  ['string.go', '--hl-string'],
  ['comment.go', '--hl-comment'],
  ['comment.go.*', '--hl-comment'],
  ['number.go', '--hl-number'],
  ['number.go.*', '--hl-number'],
  ['delimiter.go', '--hl-punct'],
  ['delimiter.go.*', '--hl-punct'],
  ['annotation.go', '--hl-attr'],
  ['identifier.go', '--hl-function'],
  ['keyword.type.go', '--hl-type'],
  ['keyword.const.go', '--hl-type'],
];

function blocks(css) {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
    ([, sourceSelector, sourceDeclarations]) => {
      const selector = sourceSelector.trim();
      const theme = selector.match(/data-theme=['"]([^'"]+)['"]/);
      const mode = selector.match(/data-mode=['"]([^'"]+)['"]/);
      if (theme && !themes.includes(theme[1]))
        throw new Error(`Untraceable palette selector ${selector}`);
      if (mode && !modes.includes(mode[1]))
        throw new Error(`Untraceable palette selector ${selector}`);

      const declarations = {};
      for (const [, name, value] of sourceDeclarations.matchAll(
        /(--[\w-]+)\s*:\s*([^;]+);/g,
      )) {
        if (name in declarations) throw new Error(`Duplicate token ${name}`);
        declarations[name] = value.trim();
      }
      return { selector, declarations };
    },
  );
}

function applies(selector, theme, mode) {
  if (!selector.includes(':root')) return false;
  const selectorTheme = selector.match(
    /data-theme=['"](glass|material|minimal)['"]/,
  );
  const selectorMode = selector.match(/data-mode=['"](light|dark)['"]/);
  return (
    (!selectorTheme || selectorTheme[1] === theme) &&
    (!selectorMode || selectorMode[1] === mode)
  );
}

function resolvedTokens(css, theme, mode) {
  const values = {};
  for (const block of blocks(css)) {
    if (applies(block.selector, theme, mode))
      Object.assign(values, block.declarations);
  }
  for (const token of required) {
    if (!values[token])
      throw new Error(`Missing required token ${token} for ${theme}/${mode}`);
    if (values[token].includes('var('))
      throw new Error(`Unresolved token ${token} for ${theme}/${mode}`);
  }
  return values;
}

function monacoColor(value) {
  const rgba = value.match(
    /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/,
  );
  if (!rgba) return value;
  const [, red, green, blue, alpha] = rgba;
  const hex = [red, green, blue]
    .map((component) => Number(component).toString(16).padStart(2, '0'))
    .join('');
  if (alpha === undefined) return `#${hex}`;
  return `#${hex}${Math.round(Number(alpha) * 255)
    .toString(16)
    .padStart(2, '0')}`;
}

function rulesFor(values) {
  return [...markdownRules, ...goRules].map(([token, cssToken]) => ({
    token,
    foreground: monacoColor(values[cssToken]),
  }));
}

function generateEditorThemes(css) {
  const definitions = {};
  for (const theme of themes)
    for (const mode of modes) {
      const values = resolvedTokens(css, theme, mode);
      definitions[`gme-${theme}-${mode}`] = {
        base: mode === 'dark' ? 'vs-dark' : 'vs',
        inherit: true,
        colors: {
          'editor.background': monacoColor(values['--app-bg']),
          'editor.foreground': monacoColor(values['--text']),
          'editorLineNumber.foreground': monacoColor(values['--gutter']),
          'editorLineNumber.activeForeground': monacoColor(values['--text']),
          'editorCursor.foreground': monacoColor(values['--accent']),
          'editor.selectionBackground': monacoColor(values['--selection-bg']),
          'editor.selectionHighlightBackground': monacoColor(
            values['--selection-bg'],
          ),
          'editor.lineHighlightBackground': monacoColor(values['--hover']),
          'editorGutter.background': monacoColor(values['--app-bg']),
          'editorWidget.background': monacoColor(values['--surface']),
          'editorWidget.border': monacoColor(values['--stroke']),
          'editorSuggestWidget.background': monacoColor(values['--surface']),
          'editorSuggestWidget.foreground': monacoColor(values['--text']),
          'editorSuggestWidget.selectedBackground': monacoColor(
            values['--accent-soft'],
          ),
          'minimap.background': monacoColor(values['--app-bg']),
          'scrollbarSlider.background': monacoColor(
            values['--scrollbar-thumb'],
          ),
          'scrollbarSlider.hoverBackground': monacoColor(
            values['--scrollbar-thumb-hover'],
          ),
          'editorError.foreground': monacoColor(values['--err']),
          'editorWarning.foreground': monacoColor(values['--warn']),
        },
        rules: rulesFor(values),
      };
    }
  const highlightRules = [
    ['hljs-keyword', 'keyword.go'],
    ['hljs-string', 'string.go'],
    ['hljs-comment', 'comment.go'],
    ['hljs-number', 'number.go'],
    ['hljs-title', 'identifier.go'],
    ['hljs-type', 'keyword.type.go'],
    ['hljs-attr', 'annotation.go'],
    ['hljs-punctuation', 'delimiter.go'],
  ];
  const highlightCss = Object.entries(definitions)
    .flatMap(([name, definition]) =>
      highlightRules.map(([className, token]) => {
        const foreground = definition.rules.find(
          (rule) => rule.token === token,
        ).foreground;
        return `[data-gme-highlight='${name}'] .${className} { color: ${foreground}; }`;
      }),
    )
    .join('\n');
  return { themes: definitions, highlightCss };
}

async function generateFiles({ input, themesOutput, highlightOutput }) {
  const generated = generateEditorThemes(await readFile(input, 'utf8'));
  const { format, resolveConfig } = await import('prettier');
  const [themesConfig, highlightConfig] = await Promise.all([
    resolveConfig(
      resolve(__dirname, '../src/logic/theme/generatedEditorThemes.ts'),
    ),
    resolveConfig(
      resolve(__dirname, '../src/logic/theme/generatedHighlight.css'),
    ),
  ]);
  const editorSource = await format(
    `// Generated by scripts/generate-editor-themes.mjs. Do not edit.\nexport const generatedEditorThemes = ${JSON.stringify(generated.themes, null, 2)} as const;\nexport type GeneratedEditorThemeName = keyof typeof generatedEditorThemes;\n`,
    { ...themesConfig, parser: 'typescript' },
  );
  const highlightSource = await format(`${generated.highlightCss}\n`, {
    ...highlightConfig,
    parser: 'css',
  });
  await Promise.all([
    writeFile(themesOutput, editorSource),
    writeFile(highlightOutput, highlightSource),
  ]);
  return generated;
}

module.exports = { generateEditorThemes, generateFiles };
