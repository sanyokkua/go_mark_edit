import { createHash } from 'node:crypto';

export const REFERENCE_ADAPTER_VERSION = 'feature-003-reference-adapter-v2';

export const REFERENCE_ZERO_ASSISTANT_CLASS = 'no-assistant';

export const referenceVariants = [
  'base',
  'file-only',
  'file-menu',
  'conflict',
  'move-tab',
] as const;

export type ReferenceVariant = (typeof referenceVariants)[number];

export const fileOnlyReferenceStates = [
  'empty',
  'first-run',
  'six-file',
] as const;

export type FileOnlyReferenceState = (typeof fileOnlyReferenceStates)[number];

export const fileOnlyReferenceRecentFiles = Object.freeze([
  ['parity-recent-06.md', '~/Notes/archive'],
  ['parity-recent-05.md', '~/Notes/archive'],
  ['parity-recent-04.md', '~/Notes/archive'],
  ['parity-recent-03.md', '~/Notes/projects'],
  ['parity-recent-02.md', '~/Notes/projects'],
  ['parity-recent-01.md', '~/Notes/projects'],
] as const);

export const fileMenuReferencePlatforms = ['darwin', 'other'] as const;

export type FileMenuReferencePlatform =
  (typeof fileMenuReferencePlatforms)[number];

/**
 * FR-FT-056 requires behavior-owned differences from the historical mockup to
 * be rendered as explicit Feature 003 reference variants built from the same
 * binding primitives, and compared rather than masked. The File menu has four
 * such differences:
 *
 *   1. Recent folders are absent (FR-FT-042), so the mockup's `~/Documents/Notes`
 *      row is not part of the Feature 003 contract.
 *   2. `Reopen last file` replaces `Reopen last file / folder` (T049, FR-FT-041).
 *   3. New Window, Open Folder…, and Export to PDF… are visibly unavailable
 *      deferred actions, using the same primitive the reviewed `file-only`
 *      launcher variant already applies to Open folder….
 *   4. Feature 003 owns its accelerators: reopen is deliberately
 *      `Ctrl/Cmd+Shift+Alt/Option+T` rather than the mockup's `Ctrl ⇧ T`, the
 *      deferred actions carry no registry shortcut, and Exit is OS-owned.
 *
 * The mockup never draws an unavailable menu row — it has no disabled state at
 * all — while the specification requires downstream File actions to be
 * "visibly unavailable". The variant therefore carries Feature 003's own
 * reviewed unavailable opacity so the comparison still measures geometry,
 * labels and spacing instead of collapsing into a colour difference.
 *
 * The four accelerators the specification's T059 decision preserves as literal
 * `Ctrl` reference text — New File, Open File, Save and Save As — are left
 * exactly as the immutable source writes them, so the reviewed macOS
 * accelerator-glyph pixel exception stays the only accepted difference and is
 * still measured with bounded per-row evidence.
 *
 * Only the mockup's own primitives are used: `.mi`, `.mi.sub`, `.lab`, `.sep`,
 * `.k`, and `<svg class="ic"><use href="#i-file"/></svg>`. No HTML/CSS value in
 * `docs/delivery/spec/surface/mockup.html` is edited and the raw source hash is
 * unchanged.
 */
const fileMenuReferenceAccelerators: Readonly<
  Record<FileMenuReferencePlatform, Readonly<Record<string, string | null>>>
> = {
  darwin: {
    'new-window': null,
    'open-folder': null,
    reopen: '⌘⇧⌥T',
    'export-pdf': null,
    'close-tab': '⌘W',
    exit: null,
  },
  other: {
    'new-window': null,
    'open-folder': null,
    reopen: 'Ctrl+Shift+Alt+T',
    'export-pdf': null,
    'close-tab': 'Ctrl+W',
    exit: null,
  },
};

const FILE_MENU_SOURCE_MARKER = '<div class="dropdown" id="m-file"';

function acceleratorSpan(value: string | null): string {
  return value === null ? '' : `<span class="k">${value}</span>`;
}

/**
 * The single reviewed unavailable opacity, shared by every surface that draws a
 * Feature 003 deferred action. It matches production's `--disabled-opacity`.
 */
export const REFERENCE_UNAVAILABLE_OPACITY = '0.48';

function deferredAttributes(): string {
  return (
    ' aria-disabled="true" data-availability="deferred"' +
    ` style="opacity:${REFERENCE_UNAVAILABLE_OPACITY}"`
  );
}

/**
 * Session 2026-08-13 clarification, FR-FT-056. `image`, `format`, `compact` and
 * `lint` are deferred in the action registry, so production draws them visibly
 * unavailable — and Feature 003 may not change a deferred outcome. The mockup
 * has no disabled state anywhere, so without this the toolbar comparison stops
 * measuring geometry and collapses into an opacity difference: measured at
 * 1280px Minimal Light, 751 of the region's 965 differing pixels were nothing
 * but the dimming.
 *
 * This applies the same reviewed treatment `adaptFileMenu` already gives the
 * File menu's deferred rows, to the mockup's own `.tbtn` primitive, and to
 * exactly those four controls. It adds no rule the File menu variant does not
 * already carry, changes no geometry, and leaves the raw source hash untouched.
 */
const DEFERRED_TOOLBAR_CONTROL_TITLES = Object.freeze([
  'Image',
  'Format — ⌥⇧F',
  'Compact — ⌥⇧C',
  'Lint — ⌥⇧L',
] as const);

/**
 * Session 2026-08-13 clarification, FR-FT-056. FR-ED-004 requires the View menu
 * to expose Editor, Split and Preview "in the original mockup order and
 * grouping", but the mockup's `#m-view` has `Show Editor` and `Show Preview`
 * instead — so the two halves of that requirement cannot both hold against the
 * binding. Production keeps FR-ED-004's inventory and the difference is
 * expressed here, exactly as `adaptFileMenu` does for `#m-file`.
 *
 * Three differences, all from the same cause — Feature 003 owns this menu's
 * behaviour while the mockup predates it:
 *
 *   1. The arrangement rows are Editor / Split / Preview, not Show Editor /
 *      Show Preview. The mockup draws both of its rows ticked, which is the
 *      split arrangement, so Split carries the tick and the other two carry the
 *      binding's own `.tick.off` — the box keeps its width either way.
 *   2. `Toggle Assistant` and `Distraction-free reading` are deferred, so they
 *      carry no registry shortcut and production draws them visibly
 *      unavailable. The mockup gives both an accelerator at full opacity.
 *   3. Accelerators are Feature 003's own and are formatted for the host, so
 *      `Toggle Sidebar` reads `⌘\` on macOS where the mockup writes `Ctrl \`.
 *
 * Only the mockup's own primitives are used: `.mi`, `.sep`, `.k`, `.tick`,
 * `.tick.off` and `.tgl`/`.tgl.on`. The switch states are the source's own —
 * Line numbers on, Word wrap off. No HTML/CSS value in
 * `docs/delivery/spec/surface/mockup.html` is edited and the raw source hash is
 * unchanged.
 */
const viewMenuReferenceAccelerators: Readonly<
  Record<FileMenuReferencePlatform, Readonly<Record<string, string | null>>>
> = {
  darwin: {
    'toggle-sidebar': '⌘\\',
    'toggle-assistant': null,
    'distraction-free-reading': null,
    fullscreen: 'F11',
  },
  other: {
    'toggle-sidebar': 'Ctrl+\\',
    'toggle-assistant': null,
    'distraction-free-reading': null,
    fullscreen: 'F11',
  },
};

/**
 * `spec.md:599`: "The completed operating-system-managed frame supersedes the
 * mockup's obsolete custom traffic lights, drag region, resize zones, and outer
 * window shadow."
 *
 * The traffic lights are the only part of the title bar's leading run that the
 * operating system draws for us, so they are not part of the Feature 003
 * contract and the application does not reproduce them. Removing them here is
 * what lets the rest of the row — the brand, the menu, the identity — sit at a
 * position both pages derive from their own layout. The alternative, leaving
 * them in and giving production a 52px + 12px reservation to compensate, would
 * put dead space in the shipped window for a control that lives in the
 * operating system's own title bar.
 *
 * Only the mockup's own markup is touched: the `.lights` element is removed
 * whole. No HTML/CSS value is edited and the raw source hash is unchanged.
 */
const LIGHTS_SOURCE_MARKUP =
  '<div class="lights"><i class="r"></i><i class="y"></i><i class="g"></i></div>';

function adaptNativeFrameControls(html: string): string {
  // A source without the title bar at all is not a parity reference; leave it
  // untouched so unit fixtures can exercise the other variants in isolation.
  if (!html.includes(LIGHTS_SOURCE_MARKUP)) return html;
  return html.replace(LIGHTS_SOURCE_MARKUP, '');
}

const VIEW_MENU_SOURCE_MARKER = '<div class="dropdown" id="m-view"';

/**
 * Feature 003 owns its accelerators, so they are formatted for the host the
 * application is actually running on — the same rule the File menu already
 * follows, and the same host the browser under test runs on. The File menu
 * receives its platform explicitly because the manifest pins it per case; the
 * View menu appears in every variant, so it defaults to the host here.
 */
function hostReferencePlatform(): FileMenuReferencePlatform {
  return process.platform === 'darwin' ? 'darwin' : 'other';
}

function tickSpan(selected: boolean): string {
  return `<span class="tick${selected ? '' : ' off'}">✓</span>`;
}

function adaptViewMenu(
  html: string,
  platform: FileMenuReferencePlatform,
): string {
  // A source without the View menu at all is not a parity reference; leave it
  // untouched so unit fixtures can exercise the other variants in isolation,
  // exactly as `adaptPreviewPane` does.
  const start = html.indexOf(VIEW_MENU_SOURCE_MARKER);
  if (start < 0) return html;
  const open = html.indexOf('>', start);
  const end = html.indexOf(
    '</div>\n    <div class="dropdown" id="m-about"',
    open,
  );
  if (end < 0) {
    throw new Error('View-menu reference source region is malformed');
  }
  for (const required of ['class="tick"', 'class="tgl on"', 'class="sep"']) {
    if (!html.slice(open, end).includes(required)) {
      throw new Error(
        `View-menu reference source lost the required primitive: ${required}`,
      );
    }
  }
  const shortcut = viewMenuReferenceAccelerators[platform];
  const adapted = [
    '',
    `<div class="mi"><span>Toggle Sidebar</span>${acceleratorSpan(shortcut['toggle-sidebar'])}</div>`,
    `<div class="mi"${deferredAttributes()}><span>Toggle Assistant</span>${acceleratorSpan(shortcut['toggle-assistant'])}</div>`,
    `<div class="mi"><span>Editor</span>${tickSpan(false)}</div>`,
    `<div class="mi"><span>Split</span>${tickSpan(true)}</div>`,
    `<div class="mi"><span>Preview</span>${tickSpan(false)}</div>`,
    '<div class="sep"></div>',
    '<div class="mi"><span>Line numbers</span><span class="tgl on"></span></div>',
    '<div class="mi"><span>Word wrap</span><span class="tgl"></span></div>',
    '<div class="sep"></div>',
    `<div class="mi"${deferredAttributes()}><span>Distraction-free reading</span>${acceleratorSpan(shortcut['distraction-free-reading'])}</div>`,
    `<div class="mi"><span>Full screen</span>${acceleratorSpan(shortcut['fullscreen'])}</div>`,
    '',
  ].join('\n      ');
  return html.slice(0, open + 1) + adapted + html.slice(end);
}

const TOOLBAR_SOURCE_MARKER = '<div class="toolbar">';

function adaptDeferredToolbarControls(html: string): string {
  // A source without the toolbar at all is not a parity reference; leave it
  // untouched so unit fixtures can exercise the other variants in isolation.
  const start = html.indexOf(TOOLBAR_SOURCE_MARKER);
  if (start < 0) return html;
  const end = html.indexOf('</div>\n      </div>', start);
  if (end < 0) {
    throw new Error('Toolbar reference source region is malformed');
  }
  let toolbar = html.slice(start, end);
  for (const title of DEFERRED_TOOLBAR_CONTROL_TITLES) {
    const button = `<button class="tbtn`;
    const marker = `title="${title}"`;
    const at = toolbar.indexOf(marker);
    if (at < 0) {
      throw new Error(
        `Toolbar reference source lost the deferred control: ${title}`,
      );
    }
    const openedAt = toolbar.lastIndexOf(button, at);
    if (openedAt < 0) {
      throw new Error(
        `Toolbar deferred control is not a .tbtn primitive: ${title}`,
      );
    }
    const closedAt = toolbar.indexOf('>', at);
    toolbar =
      toolbar.slice(0, closedAt) +
      deferredAttributes() +
      toolbar.slice(closedAt);
  }
  return html.slice(0, start) + toolbar + html.slice(end);
}

function adaptFileMenu(
  html: string,
  platform: FileMenuReferencePlatform,
): string {
  const start = html.indexOf(FILE_MENU_SOURCE_MARKER);
  if (start < 0) {
    throw new Error('File-menu reference requires the source #m-file region');
  }
  const open = html.indexOf('>', start);
  const end = html.indexOf(
    '</div>\n    <div class="dropdown" id="m-settings"',
    open,
  );
  if (open < 0 || end < 0) {
    throw new Error('File-menu reference source region is malformed');
  }
  const original = html.slice(open + 1, end);
  for (const required of [
    'New File<span class="k">Ctrl N</span>',
    'Open File…<span class="k">Ctrl O</span>',
    'Save<span class="k">Ctrl S</span>',
    'Save As…<span class="k">Ctrl ⇧ S</span>',
    '<div class="lab">Open Recent</div>',
    '<use href="#i-folder"/>',
  ]) {
    if (!original.includes(required)) {
      throw new Error(
        `File-menu reference source lost the binding primitive: ${required}`,
      );
    }
  }
  const shortcut = fileMenuReferenceAccelerators[platform];
  const fileIcon = '<svg class="ic"><use href="#i-file"/></svg>';
  const adapted = [
    '\n      <div class="mi">New File<span class="k">Ctrl N</span></div>',
    `<div class="mi"${deferredAttributes()}>New Window${acceleratorSpan(shortcut['new-window'])}</div>`,
    '<div class="mi">Open File…<span class="k">Ctrl O</span></div>',
    `<div class="mi"${deferredAttributes()}>Open Folder…${acceleratorSpan(shortcut['open-folder'])}</div>`,
    '<div class="sep"></div><div class="lab">Open Recent</div>',
    `<div class="mi sub">${fileIcon} release-notes.md</div>`,
    `<div class="mi sub">${fileIcon} spec-draft.md</div>`,
    `<div class="mi sub" aria-disabled="true" style="opacity:${REFERENCE_UNAVAILABLE_OPACITY}">↺ Reopen last file${acceleratorSpan(shortcut['reopen'])}</div>`,
    '<div class="sep"></div>',
    '<div class="mi">Save<span class="k">Ctrl S</span></div><div class="mi">Save As…<span class="k">Ctrl ⇧ S</span></div>',
    `<div class="sep"></div><div class="mi"${deferredAttributes()}>Export to PDF…${acceleratorSpan(shortcut['export-pdf'])}</div>`,
    `<div class="sep"></div><div class="mi">Close Tab${acceleratorSpan(shortcut['close-tab'])}</div><div class="mi">Exit${acceleratorSpan(shortcut['exit'])}</div>`,
    '\n    ',
  ].join('\n      ');
  return html.slice(0, open + 1) + adapted + html.slice(end);
}

/**
 * Session 2026-08-13 clarification. The mockup's preview pane demonstrates
 * deferred rich-rendering expansion — a remote-content banner, an image
 * placeholder, KaTeX math and an inline Mermaid diagram. Those are excluded
 * rather than reproduced, so the Feature 003 reference variant carries the same
 * in-scope basic-preview content the application renders for the parity
 * document, expressed only through the mockup's own `.preview-in` primitives.
 *
 * The binding typography (`.preview h1/h2/p/ul/li/blockquote/pre`) is untouched
 * and remains the comparison target; only the demonstration content changes.
 */
export const IN_SCOPE_PREVIEW_CONTENT = [
  '<h1>Release Notes — v2.1</h1>',
  '<p>We are excited to announce the new release. This version brings improvements and fixes users asked for.</p>',
  '<h2>Highlights</h2>',
  '<ul><li>Faster startup</li><li>KaTeX math: $E = mc^2$</li><li><em>flow</em></li></ul>',
  '<blockquote><p>Tip: press Ctrl+S to save.</p></blockquote>',
  '<pre><code>graph LR; A--&gt;B; B--&gt;C;\n</code></pre>',
].join('\n              ');

function adaptPreviewPane(html: string): string {
  // A source without the preview pane at all is not a parity reference; leave
  // it untouched so unit fixtures can exercise the other variants in isolation.
  if (!html.includes('id="pane-preview"')) return html;
  const open = html.indexOf('<div class="preview-in">');
  if (open < 0) {
    throw new Error('Preview reference requires the source preview-in region');
  }
  const end = html.indexOf('\n            </div>', open);
  if (end < 0) {
    throw new Error('Preview reference source region is malformed');
  }
  for (const required of [
    'class="imgph"',
    'class="mermaid"',
    'class="katex"',
  ]) {
    if (!html.slice(open, end).includes(required)) {
      throw new Error(
        `Preview reference source lost the deferred widget marker: ${required}`,
      );
    }
  }
  return (
    html.slice(0, open) +
    '<div class="preview-in">\n              ' +
    IN_SCOPE_PREVIEW_CONTENT +
    html.slice(end)
  );
}

export type ReferenceStateCondition = Readonly<{
  readonly status: 'supported' | 'unresolved';
  readonly reason?: string;
}>;

/**
 * The historical mockup has a generic save prompt but no distinct
 * normalization prompt. Keep this contract explicit so a behavior-owned
 * state cannot accidentally reuse that neighboring reference capture.
 */
export const unresolvedReferenceStateConditions = Object.freeze({
  'prompt-normalization': Object.freeze({
    status: 'unresolved',
    reason:
      'The immutable binding mockup has no source-backed Normalize line endings? condition.',
  }),
} satisfies Readonly<Record<string, ReferenceStateCondition>>);

export function referenceStateCondition(
  stateId: string,
): ReferenceStateCondition {
  const conditions = unresolvedReferenceStateConditions as Readonly<
    Record<string, ReferenceStateCondition>
  >;
  return conditions[stateId] ?? { status: 'supported' };
}

type VariantRule = Readonly<{
  readonly allowedRegions: readonly string[];
  readonly excludedRegions: readonly string[];
}>;

const variantRules: Readonly<Record<ReferenceVariant, VariantRule>> = {
  base: { allowedRegions: [], excludedRegions: [] },
  'file-only': {
    allowedRegions: ['launcher', 'file-menu', 'tabs'],
    excludedRegions: ['workspace', 'assistant', 'rich-rendering'],
  },
  'file-menu': {
    allowedRegions: ['file-menu', 'tabs'],
    excludedRegions: ['workspace', 'assistant', 'rich-rendering'],
  },
  conflict: {
    allowedRegions: ['reload-prompt', 'tabs'],
    excludedRegions: ['workspace', 'assistant', 'rich-rendering'],
  },
  'move-tab': {
    allowedRegions: ['tab-menu', 'tabs'],
    excludedRegions: ['workspace', 'assistant', 'rich-rendering'],
  },
};

export interface ReferenceAdapterResult {
  readonly adapterHash: string;
  readonly sourceHash: string;
  readonly variant: ReferenceVariant;
  readonly html: string;
  readonly rules: VariantRule;
  readonly fileOnlyState?: FileOnlyReferenceState;
  readonly fileMenuPlatform?: FileMenuReferencePlatform;
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export const REFERENCE_ADAPTER_HASH = hash(
  JSON.stringify({
    REFERENCE_ADAPTER_VERSION,
    REFERENCE_ZERO_ASSISTANT_CLASS,
    fileOnlyReferenceStates,
    fileOnlyReferenceRecentFiles,
    fileMenuReferenceAccelerators,
    REFERENCE_UNAVAILABLE_OPACITY,
    DEFERRED_TOOLBAR_CONTROL_TITLES,
    viewMenuReferenceAccelerators,
    LIGHTS_SOURCE_MARKUP,
    IN_SCOPE_PREVIEW_CONTENT,
    variantRules,
  }),
);

function assertVariant(variant: string): asserts variant is ReferenceVariant {
  if (!referenceVariants.includes(variant as ReferenceVariant)) {
    throw new Error(`Unsupported reference variant: ${variant}`);
  }
}

function assertFileOnlyState(
  variant: ReferenceVariant,
  state: FileOnlyReferenceState | undefined,
): void {
  if (state !== undefined && variant !== 'file-only') {
    throw new Error(
      'File-only reference state ' + state + ' requires the file-only variant',
    );
  }
}

function adaptFileOnlyLauncher(
  html: string,
  state: FileOnlyReferenceState,
): string {
  if (!html.includes('class="launcher"')) {
    throw new Error('File-only reference requires the launcher source region');
  }
  if (!html.includes('>Open folder…</button>')) {
    throw new Error(
      'File-only reference requires the source Open Folder control',
    );
  }

  const withUnavailableFolder = html.replace(
    '>Open folder…</button>',
    ' disabled aria-disabled="true" data-availability="deferred">Open folder…</button>',
  );
  const recentFileRows = fileOnlyReferenceRecentFiles.map(
    ([name, parent]) =>
      '<div class="r"><svg class="ic"><use href="#i-file"/></svg>' +
      name +
      '<small>' +
      parent +
      '</small></div>',
  );
  const recentContent =
    state === 'six-file'
      ? recentFileRows.join('')
      : '<div class="r" data-no-recent-files="true">No recent files</div>';
  const recentRegion = withUnavailableFolder.match(
    /(<div class="rec">)[\s\S]*?(<\/div>\s*<\/div>\s*<\/div>)/u,
  );
  if (recentRegion === null) {
    throw new Error('File-only reference recent region is malformed');
  }
  const adaptedRecentRegion =
    recentRegion[1] +
    '<div class="lbl">Recent</div>' +
    recentContent +
    recentRegion[2];
  const adapted = withUnavailableFolder.replace(
    recentRegion[0],
    adaptedRecentRegion,
  );
  if (adapted === withUnavailableFolder) {
    throw new Error('File-only reference recent region was not adapted');
  }
  return adapted;
}

/**
 * The adapter is deliberately declarative. It records the reviewed variant
 * and permitted region boundary and activates the mockup's existing
 * zero-Assistant class without changing the source HTML/CSS values or adding
 * masks. T035 owns the browser-side region mapping for each manifest case.
 */
export function adaptReferenceHtml(
  html: string,
  variant: ReferenceVariant = 'base',
  fileOnlyState?: FileOnlyReferenceState,
  fileMenuPlatform?: FileMenuReferencePlatform,
): ReferenceAdapterResult {
  assertVariant(variant);
  assertFileOnlyState(variant, fileOnlyState);
  const rules = variantRules[variant];
  const marker = `data-reference-variant="${variant}"`;
  const withVariantMarker = html.includes(marker)
    ? html
    : html.replace(/<body\b/u, `<body ${marker}`);
  const withZeroAssistant = withVariantMarker.replace(
    '<div class="app" id="app">',
    `<div class="app ${REFERENCE_ZERO_ASSISTANT_CLASS}" id="app">`,
  );
  const withFileOnly =
    variant === 'file-only' && fileOnlyState !== undefined
      ? adaptFileOnlyLauncher(withZeroAssistant, fileOnlyState)
      : withZeroAssistant;
  const withNativeFrame = adaptNativeFrameControls(withFileOnly);
  const withInScopePreview = adaptPreviewPane(withNativeFrame);
  const withDeferredToolbar = adaptDeferredToolbarControls(withInScopePreview);
  const withViewMenu = adaptViewMenu(
    withDeferredToolbar,
    fileMenuPlatform ?? hostReferencePlatform(),
  );
  const adaptedHtml =
    variant === 'file-menu'
      ? adaptFileMenu(withViewMenu, fileMenuPlatform ?? 'other')
      : withViewMenu;
  return {
    adapterHash: REFERENCE_ADAPTER_HASH,
    sourceHash: hash(html),
    variant,
    html: adaptedHtml,
    rules,
    fileOnlyState,
    fileMenuPlatform:
      variant === 'file-menu' ? (fileMenuPlatform ?? 'other') : undefined,
  };
}

export function referenceVariantRules(variant: ReferenceVariant): VariantRule {
  return variantRules[variant];
}
