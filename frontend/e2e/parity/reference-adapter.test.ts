import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  adaptNarrowSinglePane,
  adaptReferenceHtml,
  adaptStatusBar,
  IN_SCOPE_PREVIEW_CONTENT,
  REFERENCE_NARROW_HIDDEN_PANE_STYLE,
  REFERENCE_ADAPTER_HASH,
  REFERENCE_ADAPTER_VERSION,
  REFERENCE_STATUS_ITEM_CONTAINMENT,
  REFERENCE_ZERO_ASSISTANT_CLASS,
  fileOnlyReferenceRecentFiles,
  fileOnlyReferenceStates,
  referenceStateCondition,
  referenceVariantRules,
  referenceVariants,
  statusReferenceStateFor,
  statusReferenceStates,
  STATUS_REFERENCE_PRODUCTIONS,
  unresolvedReferenceStateConditions,
} from './reference-adapter';

const bindingHtml =
  '<html><body><div class="app" id="app"><main>binding</main></div></body></html>';
const launcherHtml = [
  '<html><body><div class="app" id="app">',
  '<div class="launcher"><div class="lc">',
  '<div class="acts"><button>New file</button><button>Open file…</button><button>Open folder…</button></div>',
  '<div class="rec"><div class="lbl">Recent</div>',
  '<div class="r"><svg class="ic"><use href="#i-file"/></svg>release-notes.md<small>~/Notes/projects</small></div>',
  '<div class="r"><svg class="ic"><use href="#i-file"/></svg>spec-draft.md<small>~/Notes/projects</small></div>',
  '<div class="r"><svg class="ic"><use href="#i-file"/></svg>readme.md<small>~/Notes/archive</small></div>',
  '<div class="r"><svg class="ic"><use href="#i-folder"/></svg>Notes<small>~/</small></div>',
  '</div></div></div></div>',
  '</body></html>',
].join('');

// Proves: FR-FT-050 (partial — the immutable source hash; the rendered-value match is proven by targeted-parity.test.ts)
it('reference adapter hash is stable and bounded', () => {
  const first = adaptReferenceHtml(bindingHtml, 'file-only');
  const second = adaptReferenceHtml(bindingHtml, 'file-only');

  expect(first.adapterHash).toBe(REFERENCE_ADAPTER_HASH);
  expect(first.adapterHash).toBe(second.adapterHash);
  expect(first.sourceHash).toBe(second.sourceHash);
  expect(first.html).toContain(`data-reference-variant="file-only"`);
  expect(first.html).toContain(`class="app ${REFERENCE_ZERO_ASSISTANT_CLASS}"`);
  expect(first.html).not.toContain('iframe');
  expect(first.rules.excludedRegions).toEqual([
    'workspace',
    'assistant',
    'rich-rendering',
    'monaco',
  ]);
  expect(REFERENCE_ADAPTER_VERSION).toBe('feature-003-reference-adapter-v3');
});

// Proves: FR-FT-056 (partial — the variant boundary; the comparisonAttempted rule is proven by evidence.test.ts)
it('reference adapter exposes only the reviewed variant boundary', () => {
  expect(referenceVariants).toEqual([
    'base',
    'file-only',
    'file-menu',
    'conflict',
    'move-tab',
    'status-mixed-ending',
    'status-large-file',
    'editor-split-375',
  ]);
  expect(referenceVariantRules('move-tab').allowedRegions).toEqual([
    'tab-menu',
    'tabs',
  ]);
  expect(() => adaptReferenceHtml(bindingHtml, 'workspace' as never)).toThrow(
    'Unsupported reference variant',
  );
});

it('documents normalization as unresolved instead of reusing the save prompt', () => {
  expect(referenceStateCondition('prompt-normalization')).toEqual({
    status: 'unresolved',
    reason:
      'The immutable binding mockup has no source-backed Normalize line endings? condition.',
  });
  expect(unresolvedReferenceStateConditions).toHaveProperty(
    'prompt-normalization',
  );
  expect(referenceStateCondition('resync-recovery')).toEqual({
    status: 'supported',
  });
});

it('adapts the file-only launcher from source-backed file rows and unavailable Open Folder', () => {
  expect(fileOnlyReferenceStates).toEqual(['empty', 'first-run', 'six-file']);

  const empty = adaptReferenceHtml(launcherHtml, 'file-only', 'first-run');
  expect(empty.html.match(/class="r"/gu)).toHaveLength(1);
  expect(empty.html).toContain('data-no-recent-files="true"');
  expect(empty.html).toContain(
    'disabled aria-disabled="true" data-availability="deferred"',
  );
  expect(empty.fileOnlyState).toBe('first-run');

  const six = adaptReferenceHtml(launcherHtml, 'file-only', 'six-file');
  expect(six.html.match(/class="r"/gu)).toHaveLength(6);
  expect(six.html).not.toContain('#i-folder');
  expect(
    [...six.html.matchAll(/>(parity-recent-\d{2}\.md)<small>/gu)].map(
      ([, name]) => name,
    ),
  ).toEqual(fileOnlyReferenceRecentFiles.map(([name]) => name));
});

it('rejects a file-only state on a non-file-only reference variant', () => {
  expect(() => adaptReferenceHtml(bindingHtml, 'base', 'empty')).toThrow(
    'requires the file-only variant',
  );
});

it('T045 carries in-scope preview content and drops deferred rich rendering', () => {
  const source = readFileSync(
    resolve(process.cwd(), '../docs/delivery/spec/surface/mockup.html'),
    'utf8',
  );
  const adapted = adaptReferenceHtml(source, 'base');

  // The immutable source still demonstrates every deferred widget.
  expect(source).toContain('class="imgph"');
  expect(source).toContain('class="mermaid"');
  expect(source).toContain('class="katex"');

  // The reference the parity run serves carries only in-scope basic preview.
  expect(adapted.html).toContain(IN_SCOPE_PREVIEW_CONTENT);
  const previewRegion = adapted.html.slice(
    adapted.html.indexOf('<div class="preview-in">'),
    adapted.html.indexOf('<div class="preview-in">') + 900,
  );
  expect(previewRegion).not.toContain('class="imgph"');
  expect(previewRegion).not.toContain('class="mermaid"');
  expect(previewRegion).not.toContain('class="katex"');

  // The binding typography and the raw source hash are untouched.
  expect(adapted.html).toContain('.preview h1{font-size:25px');
  expect(adapted.html).toContain('.preview-in{padding:20px 26px}');
  expect(adapted.sourceHash).toBe(
    adaptReferenceHtml(source, 'base').sourceHash,
  );
});

function statusBarRegion(html: string): string {
  const start = html.indexOf('<div class="statusbar">');
  expect(start).toBeGreaterThan(-1);
  const end = html.indexOf('\n  </div>', start);
  expect(end).toBeGreaterThan(start);
  return html.slice(start, end);
}

it('T063 exposes only the two status conditions the binding can express', () => {
  expect(statusReferenceStates).toEqual(['mixed-ending', 'large-file']);
  expect(statusReferenceStateFor('status-mixed-ending')).toBe('mixed-ending');
  expect(statusReferenceStateFor('status-large-file')).toBe('large-file');
  expect(statusReferenceStateFor('base')).toBeUndefined();
  expect(statusReferenceStateFor('file-menu')).toBeUndefined();
  expect(referenceVariantRules('status-mixed-ending')).toEqual({
    allowedRegions: ['status-bar'],
    excludedRegions: ['workspace', 'assistant', 'rich-rendering', 'monaco'],
  });
  expect(referenceVariantRules('status-large-file')).toEqual({
    allowedRegions: ['status-bar'],
    excludedRegions: ['workspace', 'assistant', 'rich-rendering', 'monaco'],
  });
});

it('T063 status variants rewrite only their own span and leave the rest byte-identical', () => {
  const source = readFileSync(
    resolve(process.cwd(), '../docs/delivery/spec/surface/mockup.html'),
    'utf8',
  );
  const base = statusBarRegion(adaptReferenceHtml(source, 'base').html);

  // The immutable source still carries both binding conditions verbatim.
  expect(base).toContain('<span class="b sb-eol">LF</span>');
  expect(base).toContain('<span class="b sb-count">231 words</span>');

  for (const [variant, state] of [
    ['status-mixed-ending', 'mixed-ending'],
    ['status-large-file', 'large-file'],
  ] as const) {
    const production = STATUS_REFERENCE_PRODUCTIONS[state];
    const sourceSpan = `<span class="b ${production.itemClass}">${production.sourceText}</span>`;
    const adaptedSpan =
      `<span class="b ${production.itemClass}"` +
      ` style="${REFERENCE_STATUS_ITEM_CONTAINMENT}">` +
      `${production.productionText}</span>`;
    const adapted = adaptReferenceHtml(source, variant);

    expect(adapted.statusState).toBe(state);
    // Every other byte of the binding's status row is unchanged: the whole
    // region equals the base region with exactly this one span replaced.
    expect(statusBarRegion(adapted.html)).toBe(
      base.replace(sourceSpan, adaptedSpan),
    );
    expect(statusBarRegion(adapted.html)).toContain(adaptedSpan);
    expect(statusBarRegion(adapted.html)).not.toContain(sourceSpan);
    // The raw immutable source hash is untouched by the adaptation.
    expect(adapted.sourceHash).toBe(
      adaptReferenceHtml(source, 'base').sourceHash,
    );
  }

  // Each variant leaves the other condition exactly as the binding writes it.
  expect(
    statusBarRegion(adaptReferenceHtml(source, 'status-mixed-ending').html),
  ).toContain('<span class="b sb-count">231 words</span>');
  expect(
    statusBarRegion(adaptReferenceHtml(source, 'status-large-file').html),
  ).toContain('<span class="b sb-eol">LF</span>');
});

it('T063 refuses a status source that lost the binding condition it adapts', () => {
  const withoutLineEnding = [
    '<html><body><div class="app" id="app">',
    '  <div class="statusbar">',
    '    <span class="b sb-count">231 words</span>',
    '\n  </div>',
    '</div></body></html>',
  ].join('');
  expect(() => adaptStatusBar(withoutLineEnding, 'mixed-ending')).toThrow(
    /lost the required primitive: class="b sb-eol"/u,
  );

  const withRewrittenCount = [
    '<html><body><div class="app" id="app">',
    '  <div class="statusbar">',
    '    <span class="b sb-eol">LF</span>',
    '<span class="b sb-count">99 words</span>',
    '\n  </div>',
    '</div></body></html>',
  ].join('');
  expect(() => adaptStatusBar(withRewrittenCount, 'large-file')).toThrow(
    /lost the large-file condition/u,
  );

  // A fixture with no status bar at all is not a parity reference.
  expect(adaptStatusBar(bindingHtml, 'mixed-ending')).toBe(bindingHtml);
});

it('T076 hides the non-selected pane at the minimum window, and nothing else', () => {
  const source = readFileSync(
    resolve(process.cwd(), '../docs/delivery/spec/surface/mockup.html'),
    'utf8',
  );
  const base = adaptReferenceHtml(source, 'base');
  const narrow = adaptReferenceHtml(source, 'editor-split-375');

  // The binding stacks both panes at 375 and draws neither hidden.
  expect(source).toContain('.app[data-w="375"] .body{');
  expect(source).toContain('<div class="pane" id="pane-preview">');
  expect(base.html).toContain('<div class="pane" id="pane-preview">');

  // The variant hides exactly the preview pane, using the binding's own
  // `.app.only-editor #pane-preview{display:none}` declaration (mockup.html:299).
  expect(source).toContain('.app.only-editor #pane-preview');
  expect(REFERENCE_NARROW_HIDDEN_PANE_STYLE).toBe('display:none');
  expect(narrow.html).toContain(
    `<div class="pane" id="pane-preview" style="${REFERENCE_NARROW_HIDDEN_PANE_STYLE}">`,
  );
  expect(narrow.html).toContain('<div class="pane" id="pane-editor">');

  // Every other byte is the base adaptation: the whole document equals the base
  // document with exactly that one opening tag rewritten.
  expect(narrow.html).toBe(
    base.html
      .replace(
        'data-reference-variant="base"',
        'data-reference-variant="editor-split-375"',
      )
      .replace(
        '<div class="pane" id="pane-preview">',
        `<div class="pane" id="pane-preview" style="${REFERENCE_NARROW_HIDDEN_PANE_STYLE}">`,
      ),
  );
  expect(narrow.sourceHash).toBe(base.sourceHash);
  expect(referenceVariantRules('editor-split-375').excludedRegions).toEqual([
    'workspace',
    'assistant',
    'rich-rendering',
    'monaco',
  ]);
});

it('T076 refuses a source whose preview pane is no longer a .pane primitive', () => {
  const renamedPane = [
    '<html><body><div class="app" id="app">',
    '<div class="pane" id="pane-editor"></div>',
    '<div class="panel" id="pane-preview"></div>',
    '</div></body></html>',
  ].join('');
  expect(() => adaptNarrowSinglePane(renamedPane)).toThrow(
    'Narrow single-pane reference requires the source #pane-preview element',
  );

  const missingEditor = [
    '<html><body><div class="app" id="app">',
    '<div class="pane" id="pane-preview"></div>',
    '</div></body></html>',
  ].join('');
  expect(() => adaptNarrowSinglePane(missingEditor)).toThrow(
    'Narrow single-pane reference requires the source #pane-editor element',
  );

  // A fixture with no panes at all is not a parity reference.
  expect(adaptNarrowSinglePane(bindingHtml)).toBe(bindingHtml);
});

it('T045 refuses a source whose preview region lost a deferred widget marker', () => {
  const broken = [
    '<html><body><div class="app" id="app">',
    '<div class="pane" id="pane-preview"><div class="preview">',
    '<div class="preview-in">',
    '<h1>Release Notes</h1>',
    '\n            </div>',
    '</div></div></div></body></html>',
  ].join('');

  expect(() => adaptReferenceHtml(broken, 'base')).toThrow(
    /lost the deferred widget marker/u,
  );
});

/*
 * T112. The Settings popup's one accelerator is a Feature 003 accelerator, so
 * the reference expresses it for the host rather than keeping the mockup's
 * platform-blind `Ctrl ,`. This is a variant, not a fifth glyph exception:
 * FR-FT-056 wants behavior-owned differences compared rather than masked, and
 * the reviewed exception stays capped at the four File rows the T059 decision
 * preserves as literal `Ctrl` text.
 */
it('T112 expresses the Settings accelerator for the host in the reference variant', () => {
  const source = readFileSync(
    resolve(process.cwd(), '../docs/delivery/spec/surface/mockup.html'),
    'utf8',
  );
  const { html } = adaptReferenceHtml(source, 'base');
  const expected = process.platform === 'darwin' ? '⌘,' : 'Ctrl+,';

  /*
   * Scoped to the Settings dropdown deliberately. The mockup also writes
   * `Ctrl ,` in its keyboard-shortcuts cheat-sheet screen (`mockup.html:917`),
   * which is a different surface, is not in the targeted manifest, and is not
   * this task's contract — asserting over the whole document would quietly
   * widen T112's scope to a screen nothing compares.
   */
  const start = html.indexOf('<div class="dropdown" id="m-settings"');
  const settings = html.slice(
    start,
    html.indexOf('</div>', html.indexOf('All settings', start)),
  );
  expect(start).toBeGreaterThan(-1);

  expect(settings).toContain(`<span class="k">${expected}</span>`);
  // The platform-blind source text must not survive in the compared popup.
  expect(settings).not.toContain('<span class="k">Ctrl ,</span>');
  // Only the accelerator changes — the row and its label are untouched.
  expect(settings).toContain('<span>All settings…</span>');
});

it('T112 fails closed when the source loses the Settings accelerator', () => {
  const source = readFileSync(
    resolve(process.cwd(), '../docs/delivery/spec/surface/mockup.html'),
    'utf8',
  );
  const withoutAccelerator = source.replace(
    '<span class="k">Ctrl ,</span>',
    '',
  );

  expect(() => adaptReferenceHtml(withoutAccelerator, 'base')).toThrow(
    'Settings reference source lost the All settings accelerator',
  );
});

/*
 * T127. The T059 decision left New File, Open File, Save and Save As carrying
 * the mockup's literal `Ctrl N` / `Ctrl O` / `Ctrl S` / `Ctrl ⇧ S`, and excused
 * the resulting macOS difference with an accepted rectangle in
 * `targeted-parity.test.ts`. That rectangle skipped its pixels before
 * attribution, so they counted as attributed with no term accounting for them,
 * carried no ceiling, no channel bound and no shrink rule — and it covered
 * glyphs, which FR-FT-055 forbids a mask from hiding.
 *
 * The exception is retired by giving those four rows the same treatment
 * `close-tab` has had since T070: Feature 003's own accelerator, formatted for
 * the host, written into the mockup's own `.k` primitive. The rows are compared
 * exactly, so there is nothing left to except.
 */
// Proves: FR-FT-056 (partial — only the File-menu clause "carries Feature 003's
//   own accelerators"; the launcher, toolbar, View-menu, tab-menu, prompt and
//   status clauses are proven by the other cases in this file)
it('T127 gives every File-menu accelerator Feature 003 host formatting', () => {
  const source = readFileSync(
    resolve(process.cwd(), '../docs/delivery/spec/surface/mockup.html'),
    'utf8',
  );

  // The immutable source still writes the platform-blind literals.
  for (const literal of [
    'New File<span class="k">Ctrl N</span>',
    'Open File…<span class="k">Ctrl O</span>',
    'Save<span class="k">Ctrl S</span>',
    'Save As…<span class="k">Ctrl ⇧ S</span>',
  ]) {
    expect(source).toContain(literal);
  }

  const darwin = adaptReferenceHtml(source, 'file-menu', undefined, 'darwin');
  const other = adaptReferenceHtml(source, 'file-menu', undefined, 'other');
  const region = (html: string): string => {
    const start = html.indexOf('<div class="dropdown" id="m-file"');
    const end = html.indexOf('<div class="dropdown" id="m-settings"', start);
    return html.slice(start, end);
  };

  for (const [row, mac, rest] of [
    ['New File', '⌘N', 'Ctrl+N'],
    ['Open File…', '⌘O', 'Ctrl+O'],
    ['Save', '⌘S', 'Ctrl+S'],
    ['Save As…', '⌘⇧S', 'Ctrl+Shift+S'],
  ] as const) {
    expect(region(darwin.html)).toContain(
      `${row}<span class="k">${mac}</span>`,
    );
    expect(region(other.html)).toContain(
      `${row}<span class="k">${rest}</span>`,
    );
  }

  // No adapted row keeps a mockup literal, on either host.
  for (const literal of ['Ctrl N', 'Ctrl O', 'Ctrl S', 'Ctrl ⇧ S']) {
    expect(region(darwin.html)).not.toContain(`<span class="k">${literal}<`);
    expect(region(other.html)).not.toContain(`<span class="k">${literal}<`);
  }

  // Only the mockup's own `.k` primitive is used, and the raw source hash is
  // unchanged by the adaptation.
  expect(darwin.sourceHash).toBe(other.sourceHash);
});
