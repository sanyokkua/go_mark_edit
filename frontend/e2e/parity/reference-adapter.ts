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

export const FILE_MENU_UNAVAILABLE_OPACITY = '0.48';

function deferredAttributes(): string {
  return (
    ' aria-disabled="true" data-availability="deferred"' +
    ` style="opacity:${FILE_MENU_UNAVAILABLE_OPACITY}"`
  );
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
    `<div class="mi sub" aria-disabled="true" style="opacity:${FILE_MENU_UNAVAILABLE_OPACITY}">↺ Reopen last file${acceleratorSpan(shortcut['reopen'])}</div>`,
    '<div class="sep"></div>',
    '<div class="mi">Save<span class="k">Ctrl S</span></div><div class="mi">Save As…<span class="k">Ctrl ⇧ S</span></div>',
    `<div class="sep"></div><div class="mi"${deferredAttributes()}>Export to PDF…${acceleratorSpan(shortcut['export-pdf'])}</div>`,
    `<div class="sep"></div><div class="mi">Close Tab${acceleratorSpan(shortcut['close-tab'])}</div><div class="mi">Exit${acceleratorSpan(shortcut['exit'])}</div>`,
    '\n    ',
  ].join('\n      ');
  return html.slice(0, open + 1) + adapted + html.slice(end);
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
    FILE_MENU_UNAVAILABLE_OPACITY,
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
  const adaptedHtml =
    variant === 'file-menu'
      ? adaptFileMenu(withFileOnly, fileMenuPlatform ?? 'other')
      : withFileOnly;
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
